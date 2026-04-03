#!/bin/bash

# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
# Licensed under the Amazon Software License  http://aws.amazon.com/asl/

set -e

## REDCap package setup
echo "Downloading REDCap from: $REDCAP_S3_URI"
aws s3 cp $REDCAP_S3_URI /tmp/redcapPackage.zip

echo "Extracting REDCap package..."
unzip -qq /tmp/redcapPackage.zip -d /tmp/

echo "Contents of /tmp after extraction:"
ls -la /tmp/

echo "Contents of /tmp/redcap (if exists):"
ls -la /tmp/redcap/ || echo "  /tmp/redcap does not exist"

echo "Copying REDCap files to /var/www/html/..."
cp -rp /tmp/redcap/* /var/www/html/ && rm -rf /tmp/redcap

echo "Contents of /var/www/html after copy:"
ls -la /var/www/html/

echo "REDCap version directories found:"
ls -d /var/www/html/redcap_v* 2>/dev/null || echo "  No redcap_v* directories found!"

chown -R www-data:www-data /var/www/html

## Check if REDCap bundles AWS SDK and verify RDS components for IAM auth
REDCAP_VERSION_DIR=$(ls -d /var/www/html/redcap_v* 2>/dev/null | sort -V | tail -n 1)

if [ -z "$REDCAP_VERSION_DIR" ]; then
  echo "WARNING: No REDCap version directory found (expected redcap_v* pattern)"
  echo "This may indicate a problem with the REDCap package extraction."
fi

INSTALL_COMPOSER_SDK=false
AWS_SDK_VERSION=""

if [ -n "$REDCAP_VERSION_DIR" ] && [ -f "$REDCAP_VERSION_DIR/Libraries/vendor/autoload.php" ]; then
  echo "REDCap bundles AWS SDK at $REDCAP_VERSION_DIR/Libraries/vendor/autoload.php"

  # Detect REDCap's AWS SDK version
  if [ -f "$REDCAP_VERSION_DIR/Libraries/vendor/aws/aws-sdk-php/src/Sdk.php" ]; then
    # Try single quotes first
    AWS_SDK_VERSION=$(grep -oP "const VERSION = '\K[^']+" "$REDCAP_VERSION_DIR/Libraries/vendor/aws/aws-sdk-php/src/Sdk.php" 2>/dev/null || echo "")
    # Fallback to double quotes
    if [ -z "$AWS_SDK_VERSION" ]; then
      AWS_SDK_VERSION=$(grep -oP 'const VERSION = "\K[^"]+' "$REDCAP_VERSION_DIR/Libraries/vendor/aws/aws-sdk-php/src/Sdk.php" 2>/dev/null || echo "")
    fi
    if [ -n "$AWS_SDK_VERSION" ]; then
      echo "REDCap's AWS SDK version: $AWS_SDK_VERSION"
    fi
  fi

  # Check if RDS components are available (needed for IAM auth and to ensure complete AWS SDK)
  if [ -f "$REDCAP_VERSION_DIR/Libraries/vendor/aws/aws-sdk-php/src/Rds/AuthTokenGenerator.php" ]; then
    echo "RDS components found in REDCap's bundled AWS SDK"
    echo "Skipping separate AWS SDK installation to avoid version conflicts"
  else
    echo "WARNING: RDS components missing in REDCap's bundled AWS SDK"
    echo "Installing matching complete AWS SDK via Composer for IAM database authentication support"
    INSTALL_COMPOSER_SDK=true
  fi
else
  echo "REDCap does not bundle AWS SDK, installing via Composer"
  INSTALL_COMPOSER_SDK=true
fi

if [ "$INSTALL_COMPOSER_SDK" = true ]; then
  mkdir -p /usr/local/share/redcap/aws

  # Install matching AWS SDK version if detected, otherwise use latest
  if [ -n "$AWS_SDK_VERSION" ]; then
    echo "Installing AWS SDK version $AWS_SDK_VERSION to match REDCap's version"
    if ! composer require aws/aws-sdk-php:$AWS_SDK_VERSION --working-dir=/usr/local/share/redcap/aws 2>&1; then
      echo "WARNING: Could not install AWS SDK version $AWS_SDK_VERSION, installing latest instead"
      composer require aws/aws-sdk-php --working-dir=/usr/local/share/redcap/aws
    fi
  else
    echo "Installing latest AWS SDK version"
    composer require aws/aws-sdk-php --working-dir=/usr/local/share/redcap/aws
  fi
fi

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
cat <<'EOF' | tee /usr/local/share/redcap/redcap_connect_iam.php >/dev/null
<?php
// Detect REDCap version and AWS SDK path
$redcapVersion = '';
$dirs = glob('/var/www/html/redcap_v*', GLOB_ONLYDIR);
if (!empty($dirs)) {
    usort($dirs, 'version_compare');
    $redcapVersion = basename(end($dirs));
}

// For IAM auth, use Composer SDK if available (has complete RDS support matching REDCap's version)
// Otherwise fallback to REDCap's bundled SDK
if (file_exists("/usr/local/share/redcap/aws/vendor/autoload.php")) {
    require_once "/usr/local/share/redcap/aws/vendor/autoload.php";
} elseif ($redcapVersion && file_exists("/var/www/html/$redcapVersion/Libraries/vendor/autoload.php")) {
    require_once "/var/www/html/$redcapVersion/Libraries/vendor/autoload.php";
} else {
    throw new Exception("AWS SDK not found. Checked Composer SDK and REDCap bundled SDK");
}

use Aws\Credentials\CredentialProvider;

$log_all_errors = FALSE;

// REQUIRED VARIABLES - Validate before use
$required_vars = ['RDS_HOSTNAME', 'RDS_DBNAME', 'RDS_PORT', 'RDS_PASSWORD', 'AWS_REGION', 'DB_SALT_ALPHA'];
$missing_vars = [];
foreach ($required_vars as $var) {
    if (getenv($var) === false || getenv($var) === '') {
        $missing_vars[] = $var;
    }
}
if (!empty($missing_vars)) {
    throw new Exception("Missing required environment variables for IAM auth: " . implode(', ', $missing_vars));
}

$hostname   = getenv('RDS_HOSTNAME');
$db         = getenv('RDS_DBNAME');
$port       = getenv('RDS_PORT');
$username   = "redcap_user";
$password   = getenv('RDS_PASSWORD');
$region     = getenv('AWS_REGION');
$salt       = getenv('DB_SALT_ALPHA');
$db_ssl_key     = NULL;
$db_ssl_cert    = NULL;
$db_ssl_ca      = "/usr/local/share/redcap/global-bundle.pem";
$db_ssl_capath  = NULL;
$db_ssl_cipher  = NULL;
$db_ssl_verify_server_cert = true;

try {
    $provider = CredentialProvider::defaultProvider();
    $RdsAuthGenerator = new Aws\Rds\AuthTokenGenerator($provider);
    $password = $RdsAuthGenerator->createToken($hostname . ":{$port}", $region, $username);
} catch (AwsException $e) {
    error_log("AWS IAM Token Generation Error: " . $e->getMessage());
    // Continue with fallback password from RDS_PASSWORD environment variable
}

EOF

# PHP database configuration: standard auth with single user secret rotation
cat <<'EOF' | tee /usr/local/share/redcap/redcap_connect_base.php >/dev/null
<?php
// Detect REDCap version and AWS SDK path
$redcapVersion = '';
$dirs = glob('/var/www/html/redcap_v*', GLOB_ONLYDIR);
if (!empty($dirs)) {
    usort($dirs, 'version_compare');
    $redcapVersion = basename(end($dirs));
}

// For Secrets Manager, use Composer SDK if available (matching version with complete components)
// Otherwise fallback to REDCap's bundled SDK
if (file_exists("/usr/local/share/redcap/aws/vendor/autoload.php")) {
    require_once "/usr/local/share/redcap/aws/vendor/autoload.php";
} elseif ($redcapVersion && file_exists("/var/www/html/$redcapVersion/Libraries/vendor/autoload.php")) {
    require_once "/var/www/html/$redcapVersion/Libraries/vendor/autoload.php";
} else {
    throw new Exception("AWS SDK not found. Checked Composer SDK and REDCap bundled SDK");
}

use Aws\SecretsManager\SecretsManagerClient;
use Aws\Exception\AwsException;

$log_all_errors = FALSE;

// Validate required environment variables
$required_vars = ['RDS_HOSTNAME', 'RDS_DBNAME', 'RDS_USERNAME', 'RDS_PASSWORD', 'DB_SALT_ALPHA', 'AWS_REGION', 'DB_SECRET_NAME'];
$missing_vars = [];
foreach ($required_vars as $var) {
    if (getenv($var) === false || getenv($var) === '') {
        $missing_vars[] = $var;
    }
}
if (!empty($missing_vars)) {
    throw new Exception("Missing required environment variables for standard auth: " . implode(', ', $missing_vars));
}

$hostname   = getenv('RDS_HOSTNAME');
$db         = getenv('RDS_DBNAME');
$username   = getenv('RDS_USERNAME');
$password   = getenv('RDS_PASSWORD');
$salt       = getenv('DB_SALT_ALPHA');

try {
    $client = new SecretsManagerClient([
        'region' => getenv('AWS_REGION'),
    ]);

    $result = $client->getSecretValue([
        'SecretId' => getenv('DB_SECRET_NAME'),
    ]);

    if (isset($result['SecretString'])) {
        $secret = $result['SecretString'];
    } else {
        $secret = base64_decode($result['SecretBinary']);
    }
    $secretArray = json_decode($secret, true);
    $password   = $secretArray['password'];

} catch (AwsException $e) {
    error_log("AWS Secrets Manager Error: " . $e->getMessage());
    // Continue with fallback password from RDS_PASSWORD environment variable
}

EOF

# PHP database configuration: replica config
cat <<'EOF' | tee /usr/local/share/redcap/redcap_connect_replica.php >/dev/null
<?php
// REPLICA
$read_replica_hostname = getenv('READ_REPLICA_HOSTNAME');
$read_replica_db       = $db;
$read_replica_username = $username;
$read_replica_password = $password;
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
