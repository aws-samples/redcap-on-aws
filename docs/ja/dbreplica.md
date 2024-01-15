JP | [EN](../en/dbreplica.md)

# REDCap database リードレプリカ

本番環境でのパフォーマンス向上は、データベースの書き込みと読み込みを分離することで可能です。`yarn deploy`でデプロイした環境では、プロビジョニングされたWriterインスタンスと、1つ以上のReaderインスタンスで構成されるAmazon Aurora Serverless v2がデプロイされます。

REDCapは`database.php` ファイルを設定することで、リードレプリカデータベースをサポートします。

## セットアップ

[database stack](../../stacks/Database.ts)のデプロイ後、リードレプリカのエンドポイントを含む`readReplicaHostname`変数が表示されます。この変数は環境変数経由でAWS App Runnerで稼働しているコンテナに渡されます。これは、[start_services.sh](../../containers/redcap-docker-apache/scripts/start_services.sh)に実装されています。

```sh
    sed "'$a \$read_replica_hostname[ tab]= '${READ_REPLICA_HOSTNAME}';" /var/www/html/database.php
    sed "'$a \$read_replica_db[ tab]= 'redcap';" /var/www/html/database.php
    sed "'$a \$read_replica_username[ tab]= '${RDS_USERNAME}';" /var/www/html/database.php
    sed "'$a \$read_replica_password[ tab]= '${RDS_PASSWORD}';" /var/www/html/database.php
    echo "Read replica set has been completed"
```

データベースクラスターにReaderインスタンスがない場合、この`readReplicaHostname`変数は定義されず、リードレプリカのセットアップは実行されません。なお、`development`モードでは、リードレプリカのセットアップは行われません。
