import { App, Stack } from 'sst/constructs';
import { EcsFargate } from '../../prototyping/constructs/EcsFargate';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { AppRunner } from '../../prototyping/constructs/AppRunner';
import { Duration, SecretValue, aws_ec2, aws_events } from 'aws-cdk-lib';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { SimpleEmailService } from '../../prototyping/constructs/SimpleEmailService';
import { RedCapAwsAccessUser } from '../../prototyping/constructs/RedCapAwsAccessUser';
import { Waf, WebACLAssociation } from '../../prototyping/constructs/Waf';
import { IGrantable } from 'aws-cdk-lib/aws-iam';
import { CfnAutoScalingConfigurationProps } from 'aws-cdk-lib/aws-apprunner';
import { Connection, HttpMethod } from 'aws-cdk-lib/aws-events';
import { ApiDestination } from 'aws-cdk-lib/aws-events-targets';
import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import { ServiceProps } from 'sst/constructs';
import { IPublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { isNumber } from 'lodash';

export class RedcapService {
  private common;
  private stack;
  private app;
  private connection: Connection;
  public ecsService?: EcsFargate;
  public appRunnerService?: AppRunner;
  public EcsServiceUrl?: string | undefined;
  public AppRunnerServiceUrl?: string | undefined;
  public CustomServiceUrl?: string | undefined;

  constructor(
    stack: Stack,
    app: App,
    common: {
      domain: string;
      subdomain: string;
      publicHostedZone?: IPublicHostedZone;
      waf: Waf;
      secrets: {
        dbSecret: ISecret;
        dbSalt: ISecret;
        ses: SimpleEmailService;
        redCapS3AccessUser: RedCapAwsAccessUser;
      };
      databaseCluster: DatabaseCluster;
      vpc: Vpc;
      servicePort: number;
      repository: Repository;
      environmentVariables: Record<string, string>;
      searchString: string;
      cronMinutes?: number;
      logRetention?: ServiceProps['logRetention']; //Only for ECS, AppRunner has no logRetention setting
    },
  ) {
    this.common = common;
    this.app = app;
    this.stack = stack;
    this.connection = this.createEventConnection();
  }

  private grantSecretsReadAndConnect(grantee: IGrantable) {
    this.common.secrets.dbSecret.grantRead(grantee);
    this.common.secrets.dbSalt.grantRead(grantee);
    this.common.secrets.ses.sesUserCredentials.grantRead(grantee);
    this.common.secrets.redCapS3AccessUser.secret.grantRead(grantee);
    this.common.databaseCluster.grantConnect(grantee, 'redcap_user');
  }

  private associateWaf(resourceArn: string, serviceType: string) {
    let id = 'apprunner-redcap';
    if (serviceType === 'ecs-redcap') id = 'ecs-redcap';
    new WebACLAssociation(this.stack, id, {
      webAclArn: this.common.waf.waf.attrArn,
      resourceArn,
    });
  }

  private setupCronJob(serviceType: string) {
    let prefixId = 'ecs-service';
    let url = this.CustomServiceUrl; //requires a valid https connection with SSL
    if (serviceType === 'apprunner') {
      url = this.AppRunnerServiceUrl;
      prefixId = 'apprunner-service';
    }

    const destination = new aws_events.ApiDestination(this.stack, `${prefixId}-destination`, {
      connection: this.connection,
      endpoint: `${url}/cron.php?secret=${this.common.searchString}`,
      httpMethod: HttpMethod.GET,
      description: `Call cron on REDCap deployment ${serviceType}`,
    });

    let schedule: aws_events.Schedule | undefined = aws_events.Schedule.rate(Duration.minutes(1));

    if (isNumber(this.common.cronMinutes)) {
      if (this.common.cronMinutes > 0)
        schedule = aws_events.Schedule.rate(Duration.minutes(this.common.cronMinutes));
      else schedule = undefined;
    }
    if (schedule)
      new aws_events.Rule(this.stack, `${prefixId}-cron`, {
        schedule,
        targets: [new ApiDestination(destination)],
      });
  }

  private createEventConnection() {
    return new aws_events.Connection(this.stack, 'redcap-connection', {
      // Auth not in use, REDCap does not have any auth requirement for this. However, this constructs requires it.
      // To protect this, we add a AWS WAF rule above.
      authorization: aws_events.Authorization.basic(
        'redcap-cron-user',
        SecretValue.unsafePlainText('nopassword'),
      ),
      description: 'Connection to REDCap cronjob',
    });
  }

  public ecsDeploy(config: {
    cpu?: ServiceProps['cpu'];
    memory?: ServiceProps['memory'];
    scaling?: ServiceProps['scaling'];
    tag: string;
  }) {
    const domainName = this.common.subdomain
      ? `${this.common.subdomain}.${this.common.domain}`
      : this.common.domain;

    this.CustomServiceUrl = `https://${domainName}`;

    this.ecsService = new EcsFargate(this.stack, `${this.app.stage}-${this.app.name}-ecs-service`, {
      app: this.app,
      network: {
        vpc: this.common.vpc,
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        servicePort: this.common.servicePort || 8080,
      },
      logRetention: this.common.logRetention,
      cpu: config.cpu || '2 vCPU',
      memory: config.memory || '4 GB',
      scaling: config.scaling,
      repository: this.common.repository,
      tag: config.tag || 'latest',
      domain: this.common.domain,
      subdomain: this.common.subdomain,
      environmentVariables: this.common.environmentVariables,
      databaseCluster: this.common.databaseCluster,
      containerInsights: true,
      publicHostedZone: this.common.publicHostedZone,
      certificate: {
        fromDns: {
          domainName,
        },
      },
    });

    const ecsTaskRole = this.ecsService.service?.cdk?.fargateService?.taskDefinition.taskRole;
    const loadBalancerArn = this.ecsService.service?.cdk?.applicationLoadBalancer?.loadBalancerArn;

    if (ecsTaskRole) this.grantSecretsReadAndConnect(ecsTaskRole);
    if (loadBalancerArn) this.associateWaf(loadBalancerArn, 'ecs-service');

    this.EcsServiceUrl = `https://${this.ecsService.url}`;
    this.setupCronJob('ecs');
  }

  public appRunnerDeploy(config: {
    notificationEmail: string;
    securityGroups: Array<SecurityGroup>;
    autoDeploymentsEnabled: boolean;
    cpu: Cpu;
    memory: Memory;
    tag: string;
    scalingConfiguration: CfnAutoScalingConfigurationProps;
  }) {
    const {
      notificationEmail,
      securityGroups,
      autoDeploymentsEnabled,
      cpu,
      memory,
      tag,
      scalingConfiguration,
    } = config;

    this.appRunnerService = new AppRunner(
      this.stack,
      `${this.app.stage}-${this.app.name}-service`,
      {
        stack: this.stack,
        app: this.app,
        publicHostedZone: this.common.publicHostedZone,
        domain: this.common.domain,
        subdomain: this.common.subdomain,
        appName: `${this.app.stage}-${this.app.name}`,
        notificationEmail: notificationEmail,
        network: {
          vpc: this.common.vpc,
          subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
          securityGroups: securityGroups,
        },
        autoDeploymentsEnabled,
        service: {
          config: {
            port: this.common.servicePort || 8080,
            cpu,
            memory,
            environmentVariables: this.common.environmentVariables,
          },
          image: {
            repositoryName: this.common.repository.repositoryName,
            tag,
          },
        },
        scalingConfiguration,
      },
    );

    this.grantSecretsReadAndConnect(this.appRunnerService.service);
    this.associateWaf(this.appRunnerService.service.serviceArn, 'apprunner');

    this.AppRunnerServiceUrl = `https://${this.appRunnerService.service.serviceUrl}`;
    if (this.appRunnerService.customUrl) {
      this.CustomServiceUrl = `https://${this.appRunnerService.customUrl}`;
    }
    this.setupCronJob('apprunner');
  }
}
