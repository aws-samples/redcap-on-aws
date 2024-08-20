FROM public.ecr.aws/docker/library/php:8.2-apache

ARG PORT
ARG LANG_S3_URI
ARG REDCAP_S3_URI
ARG AWS_DEFAULT_REGION
ARG DEBIAN_FRONTEND=noninteractive
ARG AWS_CONTAINER_CREDENTIALS_RELATIVE_URI

# Required packages setup
RUN apt-get update -qq && \
    apt-get install -yq --no-install-recommends  \
    ca-certificates jq ghostscript \
    libzip-dev libpng-dev libjpeg-dev \
    libmagickwand-dev libxml2 libxml2-dev librsvg2-dev librsvg2-bin \
    unzip curl \
    default-mysql-client msmtp msmtp-mta libsasl2-modules \
    && apt clean && rm -rf /var/lib/apt/lists/*

RUN pecl install imagick apcu \
    && docker-php-ext-enable imagick apcu \
    && docker-php-ext-install gd zip mysqli opcache

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
COPY apache2/sites-available/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY apache2/cert/apache-selfsigned.key /etc/ssl/certs/apache-selfsigned.key
COPY apache2/cert/apache-selfsigned.crt /etc/ssl/certs/apache-selfsigned.crt

RUN echo "ServerName 127.0.0.1" >> /etc/apache2/apache2.conf
RUN sed -i "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf && sed -i "s/Listen 443/Listen 8081/" /etc/apache2/ports.conf
RUN sed -i "s/\*:80/\*:${PORT}/" /etc/apache2/sites-available/000-default.conf && sed -i "s/\*:443/\*:8081/" /etc/apache2/sites-available/default-ssl.conf
RUN sed -i '/SSLCertificateFile.*snakeoil\.pem/c\SSLCertificateFile \/etc\/ssl\/certs\/apache-selfsigned.crt' /etc/apache2/sites-available/default-ssl.conf && sed -i '/SSLCertificateKeyFile.*snakeoil\.key/cSSLCertificateKeyFile /etc/ssl/certs/apache-selfsigned.key\' /etc/apache2/sites-available/default-ssl.conf
RUN chown www-data:www-data /etc/ssl/certs/apache-selfsigned.key /etc/ssl/certs/apache-selfsigned.crt
RUN a2enmod ssl && a2enmod socache_shmcb && a2ensite default-ssl && a2ensite 000-default

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