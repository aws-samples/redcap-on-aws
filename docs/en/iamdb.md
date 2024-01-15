[JP](../ja/iamdb.md) | EN

# IAM database authentication for MySQL

For `deploy` mode or the production environment the database is configured with IAM authentication between AWS AppRunner and Amazon RDS running MySQL. This means that there is no password configured for the `redcap_user` that is created for the application, instead the application will get a token for each new database connection. This enables SSL/TLS communication, greater security and centralized access control via IAM. Only AWS App Runner role is allowed to get a token to connect the database.

The configuration for this is in the [Backend](../../stacks/Backend.ts) stack, by passing a variable `USE_IAM_DB_AUTH: 'true',` to AWS App Runner construct. This will enable a series of tasks in the [start_services.sh](../../containers/redcap-docker-apache/scripts/start_services.sh) script.

1. Create `redcap_user` that is enabled to authenticate with IAM

2. Configure `database.php` with a new PHP script that will initially fetch the token

```php
require 'vendor/autoload.php';
use Aws\Credentials\CredentialProvider;
\$provider = CredentialProvider::defaultProvider();
\$RdsAuthGenerator = new Aws\Rds\AuthTokenGenerator(\$provider);
...
\$password   = \$RdsAuthGenerator->createToken(\$hostname . ":3306", \$region, \$username);
\$db_ssl_ca  = "/usr/local/share/global-bundle.pem";
\$db_ssl_verify_server_cert = true;
...
```

If you disable this option, database authentication will be retrieved and set by AWS SDK for PHP from credentials stored in AWS Secrets Manager.
