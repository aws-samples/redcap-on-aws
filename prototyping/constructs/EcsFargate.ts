/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Duration, aws_ec2, aws_iam } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ContainerImage, Secret, CfnCluster } from 'aws-cdk-lib/aws-ecs';
import { Rule } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { DefinitionBody, LogLevel, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { App, Bucket, Service, ServiceDomainProps, ServiceProps, Stack } from 'sst/constructs';
import { bucketProps } from '../overrides/BucketProps';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { CfnSecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import {
  ApplicationProtocol,
  CfnListener,
  SslPolicy,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ARecord, IPublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface EcsFargateCertificate {
  fromArn?: string;
  fromDns?: {
    domainName: string;
  };
}

export interface EcsFargateProps {
  app: App;
  instanceRole?: aws_iam.Role;
  accessRole?: aws_iam.Role;
  cpu?: ServiceProps['cpu'];
  memory?: ServiceProps['memory'];
  scaling?: ServiceProps['scaling'];
  logRetention?: ServiceProps['logRetention'];
  network: {
    vpc: aws_ec2.Vpc;
    subnetType: aws_ec2.SubnetType;
    securityGroups?: aws_ec2.ISecurityGroup[];
    servicePort?: number;
  };
  environmentVariables?: Record<string, string>;
  secrets?: { [key: string]: Secret };
  repository: Repository;
  tag: string;
  domain?: string;
  subdomain?: string;
  customDomain?: string | ServiceDomainProps | undefined;
  databaseCluster: DatabaseCluster;
  certificate?: EcsFargateCertificate;
  containerInsights?: boolean;
  publicHostedZone?: IPublicHostedZone;
}

export class EcsFargate extends Construct {
  public readonly service: Service | undefined;
  public readonly url: string | undefined;
  public readonly ecsSg: SecurityGroup;

  constructor(scope: Stack, id: string, props: EcsFargateProps) {
    super(scope, id);

    let certificate;

    if (props.certificate) {
      if (props.certificate.fromDns && props.publicHostedZone)
        certificate = new Certificate(this, 'ecs-domain-certificate', {
          domainName: props.certificate.fromDns.domainName,
          validation: CertificateValidation.fromDns(props.publicHostedZone),
        });
      else if (props.certificate.fromArn)
        certificate = Certificate.fromCertificateArn(
          this,
          'ecs-domain-certificate-import',
          props.certificate.fromArn,
        );
    }

    if (!certificate)
      throw new Error('Can not deploy ECS Fargate for REDCap without a valid certificate');

    const albLogBucket = new Bucket(this, 'albLogBucket', {
      cdk: {
        bucket: {
          ...bucketProps(props.app),
        },
      },
      cors: false,
    });

    NagSuppressions.addResourceSuppressions(albLogBucket?.cdk.bucket, [
      {
        id: 'AwsSolutions-S1',
        reason: 'Is the log bucket',
      },
    ]);

    this.ecsSg = new SecurityGroup(this, `redcap-ecs-service`, { vpc: props.network.vpc });

    const sg = props.databaseCluster.connections.securityGroups;
    const auroraSG = SecurityGroup.fromSecurityGroupId(
      this,
      'aurora-security-id',
      sg[0].securityGroupId,
      {
        mutable: true,
      },
    );
    auroraSG.addIngressRule(this.ecsSg, Port.tcp(3306));

    const albSg = new SecurityGroup(this, 'alb-sg', {
      vpc: props.network.vpc,
      allowAllOutbound: false,
      allowAllIpv6Outbound: false,
    });

    this.service = new Service(this, 'service', {
      port: props.network.servicePort || 8080,
      environment: props.environmentVariables,
      customDomain: props.customDomain,
      cpu: props.cpu ?? '2 vCPU',
      memory: props.memory ?? '4 GB',
      scaling: props.scaling,
      logRetention: props.logRetention ?? 'two_years',
      dev: {
        deploy: true,
      },
      cdk: {
        container: {
          image: ContainerImage.fromEcrRepository(
            Repository.fromRepositoryName(
              this,
              `${props.app.name}-reponame`,
              props.repository.repositoryName,
            ),
            props.tag,
          ),
          secrets: props.secrets,
        },
        vpc: props.network?.vpc,
        fargateService: {
          vpcSubnets: props.network.vpc.selectSubnets({ subnetType: props.network.subnetType }),
          securityGroups: props.network.securityGroups ?? [this.ecsSg],
          circuitBreaker: {
            enable: true,
            rollback: true,
          },
        },
        applicationLoadBalancer: {
          idleTimeout: Duration.seconds(4000),
          securityGroup: albSg,
        },
        cloudfrontDistribution: false,
        applicationLoadBalancerTargetGroup: {
          port: props.network.servicePort,
          protocol: ApplicationProtocol.HTTP,
          vpc: props.network.vpc,
        },
      },
    });

    const ecsSg = this.service.cdk?.fargateService?.connections?.securityGroups[0];
    const albSgCfn = albSg.node.defaultChild as CfnSecurityGroup;

    // ALB security group
    if (ecsSg) albSg.addEgressRule(ecsSg, Port.tcp(8080));

    albSgCfn.addOverride('Properties.SecurityGroupIngress', [
      {
        CidrIp: '0.0.0.0/0',
        Description: 'Allow traffic for HTTPS :443',
        FromPort: 443,
        IpProtocol: 'tcp',
        ToPort: 443,
      },
    ]);

    // S3 access logs
    this.service.cdk?.applicationLoadBalancer?.logAccessLogs(
      albLogBucket.cdk.bucket,
      `${props.app.stage}-redcap-alb-logs`,
    );

    // Enable cluster insights for AWS Fargate
    if (props.containerInsights) {
      const cfnCluster = this.service.cdk?.cluster?.node.defaultChild as CfnCluster;
      if (cfnCluster)
        cfnCluster.addPropertyOverride('ClusterSettings', [
          { Name: 'containerInsights', Value: 'enabled' },
        ]);
    }

    if (this.service.cdk?.applicationLoadBalancer) {
      const sstListener = this.service.cdk?.applicationLoadBalancer.listeners[0];
      const sstCfnListener = sstListener.node.defaultChild as CfnListener;

      sstListener.addCertificates('cert', [certificate]);
      sstCfnListener.addOverride('Properties.Port', 443);
      sstCfnListener.addOverride('Properties.Protocol', 'HTTPS');
      sstCfnListener.addOverride('Properties.SslPolicy', SslPolicy.RECOMMENDED_TLS);

      if (certificate && props.publicHostedZone) {
        new ARecord(this, 'alb-a-record', {
          zone: props.publicHostedZone,
          deleteExisting: true,
          comment: 'To REDCap ECS ALB',
          target: RecordTarget.fromAlias(
            new LoadBalancerTarget(this.service.cdk?.applicationLoadBalancer),
          ),
        });
      }

      this.url = this.service.cdk?.applicationLoadBalancer.loadBalancerDnsName;
    }

    const rule = new Rule(this, `${id}-ecrUpdateRule`, {
      eventPattern: {
        source: ['aws.ecr'],
        detail: {
          'action-type': ['PUSH'],
          'repository-name': [props.repository.repositoryName],
        },
      },
    });

    const serviceArn = this.service.cdk?.fargateService?.serviceArn;

    if (serviceArn) {
      const definitionBody = DefinitionBody.fromChainable(
        new CallAwsService(this, `${id}-ecsUpdate`, {
          service: 'ecs',
          action: 'updateService',
          iamResources: [serviceArn],
          parameters: {
            Service: this.service.cdk?.fargateService?.serviceName,
            Cluster: this.service.cdk?.cluster?.clusterName,
            ForceNewDeployment: true,
          },
        }),
      );

      const deployStateMachine = new StateMachine(this, `${id}-ecrStateMachine`, {
        definitionBody,
        logs: {
          destination: new LogGroup(this, `${id}-sfnLogGroup`),
          level: LogLevel.ALL,
        },
        tracingEnabled: true,
      });

      rule.addTarget(new SfnStateMachine(deployStateMachine));
    }
  }
}
