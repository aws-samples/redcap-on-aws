[JP](../ja/docker.md) | EN

# REDCap container

For AWS App Runner, we must use a container image. The process of building this image is done in a Codebuild project where the asset is uploaded to Amazon ECR and automatically deployed to App Runner.

This process is split into two steps: Build and Start.

## Build

The [Docker file](../../containers/redcap-docker-apache/Dockerfile) contain the image definition. The image is based on a public image from [docker hub](https://hub.docker.com/_/php) with a REDCap compatible PHP version 8.1.

This definition also has required packages like `libmagick` that are required for REDCap to work. Also, the official AWS CLI is included to perform S3 operations, like fetching your REDCap installation file from S3 after is uploaded by CDK or yourself.

After all the dependencies are installed a bash [script](../../containers/redcap-docker-apache/scripts/setup_app.sh) is executed. This is a script that performs the following tasks:

1. Fetch the REDCap installation file from S3
2. Copy any language file for REDCap
3. Configure PHP and variables

## Start

This is the entry point for the container to start the application and execute the final configurations. A final configuration will be like fetching any kind of secret, like database password or credentials. As a best practice, any kind of secret should not be recorded in the build process.

The script will do:

1. Setup database credentials and replica (if configured)
2. Configure Postfix for email with Amazon SES
3. Execute `install.php` to initialize REDCap (post execution of this have no impact)
4. Execute the `redcapConfig.sql` that contains your REDCap settings (email, domain name, etc) in the tables `redcap_config`, `redcap_auth` and `redcap_user_information`
5. Start postfix and apache services.
