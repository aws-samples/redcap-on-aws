JP | [EN](../en/iamdb.md)

# データベースの IAM 認証

`deploy` モードまたは本番環境では、データベースは AWS AppRunner と Amazon RDS を IAM 認証を用いて接続します。つまり、アプリケーション用に作成された `redcap_user` にはパスワードが設定されておらず、代わりにアプリケーションは新しいデータベース接続ごとにトークンを取得します。これにより、SSL/TLS 通信、セキュリティの強化、IAM による一元的なアクセス制御が可能になります。 データベースに接続するためのトークンを取得できるのは、AWS App Runner 用のロールだけです。

この設定は [Backend](../../stacks/Backend.ts) で、AppRunner コンストラクトに `USE_IAM_DB_AUTH: 'true' を指定することで有効化されます。これにより、[start_services.sh](../../containers/redcap-docker-apache/scripts/start_services.sh) で一連の処理が有効になります。

1. IAM 認証を有効化した `redcap_user` を作成します。

2. トークンを取得するための追加の PHP スクリプトで `database.php` を設定します。

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

このオプションを無効にすると、データベース認証は AWS Secrets Manager に保存されたクレデンシャルを AWS SDK for PHP で取得し、設定されるようになります。
