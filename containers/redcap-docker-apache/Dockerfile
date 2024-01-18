FROM public.ecr.aws/docker/library/php:8.1-apache

ARG DEBIAN_FRONTEND=noninteractive
ARG REDCAP_S3_URI
ARG LANG_S3_URI
ARG AWS_DEFAULT_REGION
ARG AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
ARG PORT
ARG PHP_TIMEZONE

# Required packages setup
RUN apt-get update -qq && \
    apt-get install -yq --no-install-recommends  \
    ca-certificates jq ghostscript \
    libzip-dev libpng-dev libjpeg-dev \
    libmagickwand-dev libxml2 libxml2-dev librsvg2-dev librsvg2-bin \
    unattended-upgrades unzip curl \
    default-mysql-client msmtp msmtp-mta libsasl2-modules \
    && apt clean && rm -rf /var/lib/apt/lists/*

RUN pecl install imagick apcu \
    && docker-php-ext-enable imagick apcu \
    && docker-php-ext-install gd zip mysqli

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"\
    && unzip -qq /tmp/awscliv2.zip -d /tmp/ \
    && /tmp/aws/install -i /usr/local/aws-cli -b /usr/local/bin \
    && rm /tmp/awscliv2.zip && rm -rf /tmp/aws

# Composer PHP SDK
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
RUN mkdir -p /usr/local/share/redcap/aws && composer require aws/aws-sdk-php --working-dir=/usr/local/share/redcap/aws

# RDS certificate 
RUN curl "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" -o "/usr/local/share/redcap/global-bundle.pem"

# Fix ImageMagick policy for REDCap
RUN sed -i '/<policy domain="coder" rights="none" pattern="PDF" \/>/{d;}'  /etc/ImageMagick-6/policy.xml

# Apache config
COPY apache2/sites-available/000-default.conf /etc/apache2/sites-enabled/000-default.conf
RUN echo "ServerName 127.0.0.1" >> /etc/apache2/apache2.conf
RUN sed -i "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf
RUN sed -i "s/\*:80/\*:${PORT}/" /etc/apache2/sites-enabled/000-default.conf

# Container start scripts
COPY scripts/ /etc/redcap-entry/
RUN chown www-data -R /etc/redcap-entry && chmod a+x /etc/redcap-entry/*.sh && /etc/redcap-entry/setup_app.sh
RUN touch /etc/msmtprc && chown www-data /etc/msmtprc

# Run apache as www-data 
USER www-data

# Redcap database setup script
COPY sql/ /etc/redcap-entry/

# Configure redcap - db, mail, etc.
ENTRYPOINT ["/etc/redcap-entry/redcap_configure.sh"]

# Start apache
CMD ["apache2-foreground"]