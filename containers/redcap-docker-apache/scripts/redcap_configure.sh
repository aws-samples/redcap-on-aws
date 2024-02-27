#!/bin/bash

# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
# Licensed under the Amazon Software License  http://aws.amazon.com/asl/

set -e

DB_SECRET="$(aws secretsmanager get-secret-value --secret-id ${DB_SECRET_ID} --query 'SecretString' --output text --region ${AWS_REGION})"
DB_SALT="$(aws secretsmanager get-secret-value --secret-id ${DB_SALT_SECRET_ID} --query 'SecretString' --output text --region ${AWS_REGION})"
SES_CREDENTIALS="$(aws secretsmanager get-secret-value --secret-id ${SES_CREDENTIALS_SECRET_ID} --query 'SecretString' --output text --region ${AWS_REGION})"
S3_SECRET="$(aws secretsmanager get-secret-value --secret-id ${S3_SECRET_ID} --query 'SecretString' --output text --region ${AWS_REGION})"

export RDS_HOSTNAME="$(echo $DB_SECRET | jq -r .host)"
export RDS_USERNAME="$(echo $DB_SECRET | jq -r .username)"
export RDS_PASSWORD="$(echo $DB_SECRET | jq -r .password)"
export RDS_DBNAME="$(echo $DB_SECRET | jq -r .dbname)"
export RDS_PORT="$(echo $DB_SECRET | jq -r .port)"

export SES_USERNAME="$(echo $SES_CREDENTIALS | jq -r .username)"
export SES_PASSWORD="$(echo $SES_CREDENTIALS | jq -r .password)"

export S3_ACCESS_KEY="$(echo $S3_SECRET | jq -r .AccessKeyId)"
export S3_SECRET_ACCESS_KEY="$(echo $S3_SECRET | jq -r .SecretAccessKey)"

# DB_SALT in alphanumeric
export DB_SALT_ALPHA=$(echo -n "$DB_SALT" | sha256sum | cut -d' ' -f1)

if [ "$USE_IAM_DB_AUTH" = 'true' ]; then
    echo "- Using IAM auth"
    mysql -h ${RDS_HOSTNAME} -u ${RDS_USERNAME} -D ${RDS_DBNAME} --password=${RDS_PASSWORD} -e "
        CREATE USER IF NOT EXISTS 'redcap_user'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
        ALTER USER IF EXISTS 'redcap_user'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
        GRANT ALL PRIVILEGES ON \`${RDS_DBNAME}\`.* TO 'redcap_user'@'%';
        GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'redcap_user'@'%';
        FLUSH PRIVILEGES;
    "
    echo "include '/usr/local/share/redcap/redcap_connect_iam.php';" >>/var/www/html/database.php
else
    echo "- Using base auth"
    echo "include '/usr/local/share/redcap/redcap_connect_base.php';" >>/var/www/html/database.php
fi

if [ ! -z "$READ_REPLICA_HOSTNAME" ]; then
    echo "- Using replica"
    echo "include '/usr/local/share/redcap/redcap_connect_replica.php';" >>/var/www/html/database.php
fi

# EMAIL Setting for REDCap
if [ -z "$SES_USERNAME" ]; then
    echo "Credentials not set, smtp will not be configured"
else
    cat <<EOF >/etc/msmtprc
defaults
tls on
tls_starttls on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
syslog on

account default
host email-smtp.${AWS_REGION}.amazonaws.com
port 587
auth on
user $SES_USERNAME
password $SES_PASSWORD
from ${SMTP_EMAIL:=localhost}
EOF
fi

# REDCap initial DB SETUP
if [ -f "/var/www/html/install.php" ]; then
    echo " - Executing install.php"
    cd /var/www/html
    php -r '$_GET["auto"]=1; $_GET["sql"]=1 ; $_SERVER["REQUEST_METHOD"] = "POST"; $_SERVER["PHP_SELF"]= "install.php"; require_once("install.php");'
fi

HAS_AMAZON_S3_KEY=$(mysql redcap -h ${RDS_HOSTNAME} -u ${RDS_USERNAME} -p${RDS_PASSWORD} -se "select value from redcap_config where field_name='amazon_s3_key'")

if [ "${#HAS_AMAZON_S3_KEY}" -gt 2 ]; then
    echo '- REDCap initial settings already configured, skipping'
else
    # REDCap SQL Initialization Configuration
    REDCAP_CONFIG_SQL=/etc/redcap-entry/redcapConfig.sql
    
    if [ -f "$REDCAP_CONFIG_SQL" ]; then
        echo " - Using provided redcapConfig.sql for REDCap settings"
    else
        echo " - Using default REDCap DB settings"
        REDCAP_CONFIG_SQL=/etc/redcap-entry/redcapConfig.default.sql
    fi

    echo ' - Configuring REDCap DB settings...'
    sed -i "s|\\APPLICATION_BUCKET_NAME|$S3_BUCKET|g; s|\\REDCAP_IAM_USER_ACCESS_KEY|${S3_ACCESS_KEY//\//\\/}|g; s|\\REDCAP_IAM_USER_SECRET|${S3_SECRET_ACCESS_KEY//\//\\/}|g; s|\\REGION|$AWS_REGION|g;" $REDCAP_CONFIG_SQL
    mysql -h ${RDS_HOSTNAME} -u ${RDS_USERNAME} -D redcap --password=${RDS_PASSWORD} <$REDCAP_CONFIG_SQL
    echo ' - Done'
fi

exec "$@"
