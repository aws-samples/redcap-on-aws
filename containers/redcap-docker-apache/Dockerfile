FROM composer@sha256:805ff9b13d4d183754efd22d28dc32370b374308a5c04317041b57e7be7be87d AS composer

# php:8.2-apache (Debian trixie, ImageMagick 7)
FROM public.ecr.aws/docker/library/php@sha256:848bd4a97499465e365eb4681142332a958701cb6d2fff77342f02699b81985f

# Required packages setup
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && \
    apt-get install -yq --no-install-recommends \
    ca-certificates jq ghostscript \
    libzip-dev libpng-dev libjpeg-dev \
    libmagickwand-dev libxml2 libxml2-dev librsvg2-dev librsvg2-bin \
    unzip curl \
    default-mysql-client msmtp msmtp-mta libsasl2-modules \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pecl install imagick apcu \
    && docker-php-ext-enable imagick apcu \
    && docker-php-ext-install gd zip mysqli opcache

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" \
    && unzip -qq /tmp/awscliv2.zip -d /tmp/ \
    && /tmp/aws/install -i /usr/local/aws-cli -b /usr/local/bin \
    && rm /tmp/awscliv2.zip && rm -rf /tmp/aws

# Composer PHP SDK (conditionally installed in setup_app.sh based on REDCap version)
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
RUN mkdir -p /usr/local/share/redcap/aws

# RDS certificate
RUN curl "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" \
    -o "/usr/local/share/redcap/global-bundle.pem"

# Ensure REDCap can process PDFs regardless of the ImageMagick default policy.
RUN set -eu; \
    im6=/etc/ImageMagick-6/policy.xml; \
    im7=/etc/ImageMagick-7/policy.xml; \
    if [ -f "$im6" ]; then \
        sed -i '/<policy domain="coder" rights="none" pattern="PDF" \/>/d' "$im6"; \
    fi; \
    if [ -f "$im7" ] && ! grep -q 'pattern="PDF"' "$im7"; then \
        sed -i '/<\/policymap>/i\  <policy domain="coder" rights="read|write" pattern="PDF" \/>' "$im7"; \
    fi

# Apache config
COPY apache2/sites-available/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY apache2/cert/apache-selfsigned.key /etc/ssl/certs/apache-selfsigned.key
COPY apache2/cert/apache-selfsigned.crt /etc/ssl/certs/apache-selfsigned.crt

# Apache tuning: server name, ports, SSL certs, and enable required modules/sites
ARG PORT
RUN echo "ServerName 127.0.0.1" >> /etc/apache2/apache2.conf && \
    echo "ServerTokens Prod" >> /etc/apache2/apache2.conf && \
    echo "ServerSignature Off" >> /etc/apache2/apache2.conf && \
    sed -i "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf && \
    sed -i "s/Listen 443/Listen 8081/" /etc/apache2/ports.conf && \
    sed -i "s/\*:80/\*:${PORT}/" /etc/apache2/sites-available/000-default.conf && \
    sed -i "s/\*:443/\*:8081/" /etc/apache2/sites-available/default-ssl.conf && \
    sed -i '/SSLCertificateFile.*snakeoil\.pem/c\SSLCertificateFile \/etc\/ssl\/certs\/apache-selfsigned.crt' \
        /etc/apache2/sites-available/default-ssl.conf && \
    sed -i '/SSLCertificateKeyFile.*snakeoil\.key/cSSLCertificateKeyFile /etc/ssl/certs/apache-selfsigned.key\' \
        /etc/apache2/sites-available/default-ssl.conf && \
    chown www-data:www-data \
        /etc/ssl/certs/apache-selfsigned.key \
        /etc/ssl/certs/apache-selfsigned.crt && \
    a2enmod ssl && \
    a2enmod socache_shmcb && \
    a2enmod rewrite && \
    a2ensite default-ssl && \
    a2ensite 000-default

# Container start scripts
ARG LANG_S3_URI
ARG REDCAP_S3_URI
ARG AWS_DEFAULT_REGION
ARG AWS_CONTAINER_CREDENTIALS_RELATIVE_URI

COPY scripts/ /etc/redcap-entry/
RUN chown www-data -R /etc/redcap-entry && \
    chmod a+x /etc/redcap-entry/*.sh && \
    /etc/redcap-entry/setup_app.sh

RUN /etc/redcap-entry/set_redcap_version.sh

RUN touch /etc/msmtprc && chown www-data /etc/msmtprc

COPY --chown=www-data:www-data sql/ /etc/redcap-entry/

# Run apache as www-data
USER www-data

# Configure redcap - db, mail, etc.
ENTRYPOINT ["/etc/redcap-entry/redcap_configure.sh"]

# Start apache
CMD ["apache2-foreground"]
