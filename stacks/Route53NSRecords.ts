import * as stage from '../stages';

import { get, isEmpty, trim } from 'lodash';
import { aws_route53 } from 'aws-cdk-lib';
import { StackContext } from 'sst/constructs';
import { Suppressions } from '../prototyping/cdkNag/Suppressions';

interface AppRecords {
  name: string;
  nsRecords: Array<string>;
}

interface Route53NSRecordProps {
  domain: string;
  apps: Array<AppRecords>;
}

export function Route53NSRecords({ stack }: StackContext) {
  const apps = get(stage, [stack.stage, 'apps'], null);
  const domain = trim(get(stage, [stack.stage, 'domain'], null));

  if (isEmpty(apps) || !domain || domain === '') {
    return;
  }

  const config: Route53NSRecordProps = {
    apps,
    domain,
  };

  const zone = aws_route53.PublicHostedZone.fromLookup(stack, `${config.domain}-zone`, {
    domainName: config.domain,
  });

  if (config.domain && !isEmpty(config.apps)) {
    config.apps.forEach(app => {
      new aws_route53.NsRecord(stack, `ns-${config.domain}-${app.name}`, {
        zone,
        values: app.nsRecords,
        recordName: `${app.name}.${zone.zoneName}`,
      });
    });
  }

  Suppressions.Route53NS(zone);
}
