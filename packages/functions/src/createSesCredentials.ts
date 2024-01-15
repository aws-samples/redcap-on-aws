/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import {
  AccessKey,
  CreateAccessKeyCommand,
  IAMClient,
  ListAccessKeysCommand,
} from '@aws-sdk/client-iam';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
  UpdateSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { Handler } from 'aws-lambda';
import { Buffer } from 'buffer';
import { createHmac } from 'crypto';
import { get, size } from 'lodash';

const region = process.env.AWS_REGION;
async function updateSecret(SecretId: string, SecretString: string) {
  const smClient = new SecretsManagerClient({ region });
  const command = new UpdateSecretCommand({
    SecretId,
    SecretString,
  });
  try {
    const response = await smClient.send(command);
    return response;
  } catch (error) {
    console.error(error);
  }
}

async function getSecret(SecretId: string) {
  const smClient = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({
    SecretId,
  });
  try {
    const response = await smClient.send(command);
    return response;
  } catch (error) {
    console.error(error);
  }
}

async function createAccessKey(): Promise<AccessKey | undefined> {
  const iamClient = new IAMClient({ region });
  const command = new CreateAccessKeyCommand({
    UserName: process.env.SES_USERNAME,
  });

  try {
    const response = await iamClient.send(command);
    return response.AccessKey;
  } catch (error) {
    console.error(error);
  }
}

async function hasAccessKeys() {
  const iamClient = new IAMClient({ region });
  const command = new ListAccessKeysCommand({
    UserName: process.env.SES_USERNAME,
  });
  try {
    const response = await iamClient.send(command);
    return size(get(response, 'AccessKeyMetadata')) > 0;
  } catch (error) {
    console.error(error);
  }
}

export const handler: Handler = async (event) => {
  try {
    const hasKeys = await hasAccessKeys();

    if (!hasKeys) {
      return {
        statusCode: 400,
        body: 'Selected user does not have credentials to configure',
      };
    }

    let accessKey: AccessKey | undefined;

    if (process.env.TRANSFORM_CREDENTIALS_ARN) {
      const credentialsSecret = await getSecret(process.env.TRANSFORM_CREDENTIALS_ARN);
      accessKey = JSON.parse(credentialsSecret?.SecretString || '') || undefined;
    } else {
      accessKey = await createAccessKey();
    }

    if (accessKey?.SecretAccessKey && accessKey.AccessKeyId) {
      // Create ses smtp credentials
      const smtpPassword = calculateSesSmtpPassword(
        accessKey.SecretAccessKey,
        process.env.AWS_REGION || 'ap-northeast-1',
      );

      const response = JSON.stringify({
        username: accessKey.AccessKeyId,
        password: smtpPassword,
      });

      if (process.env.SES_USER_PASSWORD_ARN) {
        await updateSecret(process.env.SES_USER_PASSWORD_ARN, response);
      }
      console.log('SES password secret updated');
      return {
        statusCode: 200,
        body: response,
      };
    }
    return {
      statusCode: 400,
      body: 'Error creating SES credentials',
    };
  } catch (e) {
    console.log(e);
  }
};

export const sign = (key: string[], message: string): string[] => {
  const hmac = createHmac('sha256', Buffer.from(key.map((a) => a.charCodeAt(0)))).update(
    message,
  ) as any;

  return hmac.digest('binary').toString().split('');
};

/**
 * https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html#smtp-credentials-convert
 */
export const calculateSesSmtpPassword = (secretAccessKey: string, region: string): string => {
  const date = '11111111';
  const service = 'ses';
  const terminal = 'aws4_request';
  const message = 'SendRawEmail';
  const version = [0x04];

  let signature = sign(`AWS4${secretAccessKey}`.split(''), date);
  signature = sign(signature, region);
  signature = sign(signature, service);
  signature = sign(signature, terminal);
  signature = sign(signature, message);

  const signatureAndVersion = version.slice(); // copy of array

  signature.forEach((a: string) => signatureAndVersion.push(a.charCodeAt(0)));

  return Buffer.from(signatureAndVersion).toString('base64');
};
