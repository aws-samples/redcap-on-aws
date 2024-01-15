/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { aws_certificatemanager } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, CnameRecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export class Route53Domain extends Construct {
  public readonly hostedZoneNameServers?: string[];
  public readonly certificateArn?: string;
  public readonly hostedZone: PublicHostedZone;
  constructor(
    scope: Construct,
    id: string,
    props: {
      zoneName?: string;
      publicHostedZone?: PublicHostedZone;
      appName?: string;
      certificate?: {
        DNSProviderIsRoute53?: boolean;
        validateWithEmail?: boolean;
        arn?: string;
      };
      ARecordTarget?: {
        target: RecordTarget;
        name: string;
      };
      CnameRecord?: {
        name?: string;
        value: string;
      };
    },
  ) {
    super(scope, id);

    // check if public hosted zone or zone name exist in props
    if (!props.publicHostedZone && !props.zoneName) {
      throw new Error('Route53Domain requires a zone name or a public hosted zone');
    }

    // setup public hosted zone
    this.hostedZone =
      props.publicHostedZone ??
      new PublicHostedZone(this, `${id}-hostedZone`, {
        zoneName: props.zoneName!,
      });

    // configure A record
    if (props.ARecordTarget) {
      new ARecord(this, `${id}-arecord`, {
        zone: this.hostedZone,
        target: props.ARecordTarget.target,
        recordName: props.ARecordTarget.name,
      });
    }

    // configure CNAME record
    if (props.CnameRecord) {
      const recordName = props.CnameRecord.name;
      new CnameRecord(this, `${id}-crecord`, {
        domainName: props.CnameRecord.value,
        recordName,
        zone: this.hostedZone,
      });
    }

    // certification setting
    if (props.certificate) {
      let validation;
      let certificate;
      // verify domain
      if (props.certificate.validateWithEmail) {
        validation = CertificateValidation.fromEmail();
      } else {
        validation = CertificateValidation.fromDns(
          props.certificate.DNSProviderIsRoute53 ? this.hostedZone : undefined,
        );
      }

      if (props.certificate.arn) {
        certificate = Certificate.fromCertificateArn(
          this,
          'imported-certificate',
          props.certificate.arn,
        );
      } else {
        certificate = new aws_certificatemanager.Certificate(this, `${id}-dns-validation`, {
          domainName: `*.${this.hostedZone.zoneName}`,
          validation,
        });
        this.certificateArn = certificate.certificateArn;
      }
    }

    if (this.hostedZone.hostedZoneNameServers) {
      this.hostedZoneNameServers = this.hostedZone.hostedZoneNameServers;
    }
  }
}
