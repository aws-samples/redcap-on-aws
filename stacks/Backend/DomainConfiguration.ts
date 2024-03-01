import { IPublicHostedZone, PublicHostedZone, ZoneDelegationRecord } from 'aws-cdk-lib/aws-route53';
import { isString } from 'lodash';
import { App, Stack } from 'sst/constructs';

export interface DomainProps {
  domain: string;
  subdomain?: string;
  hostInRoute53: boolean | string;
  stack: Stack;
  app: App;
}

export class DomainConfiguration {
  public readonly props;
  public publicHostedZone: IPublicHostedZone | undefined;
  constructor(props: DomainProps) {
    this.props = props;

    const { hostInRoute53, subdomain } = this.props;

    if (!this.props.domain) {
      return;
    }

    if (isString(hostInRoute53)) {
      if (!subdomain) this.awsAccountDefaultHostedZone();
      else if (isString(subdomain)) this.awsAccountWithSubdomain();
    } else if (hostInRoute53 === true) {
      this.createNewHostedZone();
    }
  }

  private createNewHostedZone() {
    const zoneName = this.props.subdomain
      ? `${this.props.subdomain}.${this.props.domain}`
      : this.props.domain;
    this.publicHostedZone = new PublicHostedZone(
      this.props.stack,
      `${this.props.app.stage}-${this.props.app.name}-hostedzone`,
      {
        zoneName,
      },
    );
  }

  private awsAccountDefaultHostedZone() {
    if (!isString(this.props.hostInRoute53)) {
      throw new Error('hostInRoute53 is not a string');
    }
    this.publicHostedZone = PublicHostedZone.fromLookup(
      this.props.stack,
      `${this.props.app.stage}-${this.props.app.name}-hostedzone`,
      {
        domainName: this.props.hostInRoute53.toString(),
      },
    );
  }

  private awsAccountWithSubdomain() {
    const rootHz = PublicHostedZone.fromLookup(
      this.props.stack,
      `${this.props.app.stage}-${this.props.app.name}-root-hostedzone`,
      {
        domainName: this.props.hostInRoute53.toString(),
      },
    );

    const newHZ = new PublicHostedZone(
      this.props.stack,
      `${this.props.app.stage}-${this.props.app.name}-hostedzone`,
      {
        zoneName: `${this.props.subdomain}.${this.props.domain}`,
      },
    );

    new ZoneDelegationRecord(
      this.props.stack,
      `${this.props.app.stage}-${this.props.app.name}-delegation-records`,
      {
        nameServers: newHZ.hostedZoneNameServers!,
        zone: rootHz,
        deleteExisting: true,
        recordName: `${this.props.subdomain}.${this.props.domain}`,
      },
    );

    this.publicHostedZone = newHZ;
  }
}
