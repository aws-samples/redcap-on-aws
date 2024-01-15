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
echo "max_input_vars = 100000" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini
echo "upload_max_filesize = 32M" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini
echo "post_max_size = 32M" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini
echo "session.cookie_secure = On" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini
echo "error_reporting  = E_ALL & ~E_DEPRECATED & ~E_STRICT" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini
echo "error_log = /dev/stdout" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini

### Set JST Timezone as default
echo "date.timezone = $PHP_TIMEZONE" >>/usr/local/etc/php/conf.d/redcap-php-overrides.ini

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
\$region     = getenv('AWS_REGION');
\$salt       = getenv('DB_SALT_ALPHA');
\$db_ssl_key     = NULL;
\$db_ssl_cert    = NULL;
\$db_ssl_ca      = "/usr/local/share/redcap/global-bundle.pem";
\$db_ssl_capath  = NULL;
\$db_ssl_cipher  = NULL;
\$db_ssl_verify_server_cert = true;
\$cached_password = apcu_fetch('password_iam');

if (\$cached_password) {
    \$password = \$cached_password;
} else {
    \$provider = CredentialProvider::defaultProvider();
    \$RdsAuthGenerator = new Aws\Rds\AuthTokenGenerator(\$provider);
    \$password = \$RdsAuthGenerator->createToken(\$hostname . ":{\$port}", \$region, \$username);
    apcu_store('password_iam', \$password, 300);
}

EOF

# PHP database configuration: standard auth with single user secret rotation
cat <<EOF | tee /usr/local/share/redcap/redcap_connect_base.php >/dev/null
<?php
require '/usr/local/share/redcap/aws/vendor/autoload.php';

use Aws\SecretsManager\SecretsManagerClient;
use Aws\Exception\AwsException;

\$log_all_errors = FALSE;

\$cached_password = apcu_fetch('password');

if (\$cached_password) {
    \$password = \$cached_password;
} else {
    
    \$client = new SecretsManagerClient([
        'region' => getenv('AWS_REGION'),
    ]);

    try {
        \$result = \$client->getSecretValue([
            'SecretId' => getenv('DB_SECRET_NAME'),
        ]);
    } catch (AwsException \$e) {
        \$password = getenv('RDS_PASSWORD'); 
    }
    if (isset(\$result['SecretString'])) {
        \$secret = \$result['SecretString'];
    } else {
        \$secret = base64_decode(\$result['SecretBinary']);
    }
    \$secretArray = json_decode(\$secret, true);
    \$password   = \$secretArray['password'];
    apcu_store('password', \$password, 120);
}

\$hostname   = getenv('RDS_HOSTNAME');
\$db         = getenv('RDS_DBNAME');
\$username   = getenv('RDS_USERNAME');
\$salt       = getenv('DB_SALT_ALPHA');
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
