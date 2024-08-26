#!/bin/bash

# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
# Licensed under the Amazon Software License  http://aws.amazon.com/asl/

## REDCap package setup
aws s3 cp $REDCAP_S3_URI /tmp/redcapPackage.zip
unzip -qq /tmp/redcapPackage.zip -d /tmp/
cp -rp /tmp/redcap/* /var/www/html/ && rm -rf /tmp/redcap
chown -R www-data:www-data /var/www/html

## REDCap languages
aws s3 cp $LANG_S3_URI /tmp/redcapLanguages.zip
unzip -qq /tmp/redcapLanguages.zip -d /tmp/languages
cp /tmp/languages/*.ini /var/www/html/languages/. 2>/dev/null

## Setup PHP variables
cat <<EOF | tee /usr/local/etc/php/conf.d/redcap-php-overrides.ini >/dev/null
max_input_vars=100000
upload_max_filesize=1000M
post_max_size=1000M
session.cookie_secure=On
error_reporting=E_ALL & ~E_DEPRECATED & ~E_STRICT
error_log=/dev/stdout
EOF

## Setup opcache
cat <<EOF | tee /usr/local/etc/php/conf.d/opcache.ini >/dev/null
opcache.enable=1
opcache.revalidate_freq=0
opcache.validate_timestamps=0
opcache.max_accelerated_files=10000
opcache.memory_consumption=192
opcache.max_wasted_percentage=10
opcache.interned_strings_buffer=16
EOF


### Set Timezone for REDCap
echo "date.timezone = \${PHP_TIMEZONE}" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini

# PHP database configuration: iam auth base
cat <<EOF | tee /usr/local/share/redcap/redcap_connect_iam.php >/dev/null
<?php
require '/usr/local/share/redcap/aws/vendor/autoload.php';
use Aws\Credentials\CredentialProvider;

\$log_all_errors = FALSE;

// REQUIRED VARIABLES
\$hostname   = getenv('RDS_HOSTNAME');
\$db         = getenv('RDS_DBNAME');
\$port       = getenv('RDS_PORT');
\$username   = "redcap_user";
\$password   = getenv('RDS_PASSWORD'); 
\$region     = getenv('AWS_REGION');
\$salt       = getenv('DB_SALT_ALPHA');
\$db_ssl_key     = NULL;
\$db_ssl_cert    = NULL;
\$db_ssl_ca      = "/usr/local/share/redcap/global-bundle.pem";
\$db_ssl_capath  = NULL;
\$db_ssl_cipher  = NULL;
\$db_ssl_verify_server_cert = true;

try {
    \$provider = CredentialProvider::defaultProvider();
    \$RdsAuthGenerator = new Aws\Rds\AuthTokenGenerator(\$provider);
    \$password = \$RdsAuthGenerator->createToken(\$hostname . ":{\$port}", \$region, \$username);
} catch (AwsException \$e) {}

EOF

# PHP database configuration: standard auth with single user secret rotation
cat <<EOF | tee /usr/local/share/redcap/redcap_connect_base.php >/dev/null
<?php
require '/usr/local/share/redcap/aws/vendor/autoload.php';

use Aws\SecretsManager\SecretsManagerClient;
use Aws\Exception\AwsException;

\$log_all_errors = FALSE;

\$hostname   = getenv('RDS_HOSTNAME');
\$db         = getenv('RDS_DBNAME');
\$username   = getenv('RDS_USERNAME');
\$password   = getenv('RDS_PASSWORD'); 
\$salt       = getenv('DB_SALT_ALPHA');

try {
    \$client = new SecretsManagerClient([
        'region' => getenv('AWS_REGION'),
    ]);

    \$result = \$client->getSecretValue([
        'SecretId' => getenv('DB_SECRET_NAME'),
    ]);

    if (isset(\$result['SecretString'])) {
        \$secret = \$result['SecretString'];
    } else {
        \$secret = base64_decode(\$result['SecretBinary']);
    }
    \$secretArray = json_decode(\$secret, true);
    \$password   = \$secretArray['password'];
    
} catch (AwsException \$e) {}        

EOF

# PHP database configuration: replica config
cat <<EOF | tee /usr/local/share/redcap/redcap_connect_replica.php >/dev/null
<?php
// REPLICA
\$read_replica_hostname = getenv('READ_REPLICA_HOSTNAME');
\$read_replica_db       = \$db;
\$read_replica_username = \$username;
\$read_replica_password = \$password;
EOF

## Configure redcap folders
chmod -R -f 777 /var/www/html/temp/
chmod -R -f 777 /var/www/html/edocs/
chmod -R -f 777 /var/www/html/modules/

## Configure php.ini php.ini-production / php.ini-development
mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

## Debug/Develop mode (uncomment)
# echo "error_reporting  =  E_ALL" >> /usr/local/etc/php/conf.d/redcap-php-overrides.ini
# mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"
