#!/bin/bash

# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
# Licensed under the Amazon Software License  http://aws.amazon.com/asl/

set -e

echo "=== Setting REDCap Version in Apache Config ==="

# Show what's in /var/www/html
echo "Contents of /var/www/html:"
ls -la /var/www/html/

echo ""
echo "Looking for redcap_v* directories..."
ls -d /var/www/html/redcap_v* 2>/dev/null || echo "  No redcap_v* directories found!"

REDCAP_LATEST_VERSION=$(ls -d /var/www/html/redcap_v* 2>/dev/null | sort -V | tail -n 1 | xargs basename)

if [ -z "$REDCAP_LATEST_VERSION" ]; then
  echo "ERROR: No REDCap version directory found in /var/www/html/"
  echo "Build cannot continue without REDCap files!"
  exit 1
fi

echo ""
echo "Detected REDCap version: $REDCAP_LATEST_VERSION"

echo "Injecting version into Apache config..."
sed -i "s|Define REDCAP_VERSION __REDCAP_VERSION_PLACEHOLDER__|Define REDCAP_VERSION ${REDCAP_LATEST_VERSION}|" \
  /etc/apache2/sites-available/000-default.conf

echo "Successfully set REDCAP_VERSION=${REDCAP_LATEST_VERSION} in Apache config"

echo ""
echo "Verifying Apache config contains the Define directive:"
grep "Define REDCAP_VERSION" /etc/apache2/sites-available/000-default.conf || echo "ERROR: Could not verify config!"

echo ""
echo "=== Version Setup Complete ==="
