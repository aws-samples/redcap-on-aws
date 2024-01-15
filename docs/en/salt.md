[JP](../ja/salt.md) | EN

# REDCap database salt

REDCap installation requires a database salt, a generated string that will be used to create encrypted content. This value, must be kept in secret and is critical for database or installation recovery.

> The project is configured to RETAIN this secret even if you delete/deprovision your REDCap installation. This allows you to recover in case of a disaster.

## Secret creation

CDK will automatically create a random string secret and store this in AWS Secret manager.

## Secret sharing

The secret is passed via ENV VARIABLE to the executing container in AWS App Runner. Before starting the services, this value is normalized to be letters and number (as REDCap recommendation) by using a hash function in [start_services.sh](../../containers/redcap-docker-apache/scripts/start_services.sh)

```sh
DB_SALT_ALPHA=$(echo -n "$DB_SALT" | sha256sum | cut -d' ' -f1)
```

Later this value is passed to the `database.php` for REDCap usage.
