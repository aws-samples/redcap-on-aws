JP | [EN](../en/dbreplica.md)

# REDCap database リードレプリカ

デフォルトでは、デプロイされた Amazon RDS Aurora V2 は、マルチ AZ 構成 (2 ゾーン) で単一の読み取り専用インスタンスを作成します。REDCap は、CDK 経由で渡される `READ_REPLICA_HOSTNAME` という環境変数を使用して、このレプリカを自動的に使用するように構成されています。

これは [setup_app.sh](/containers/redcap-docker-apache/scripts/setup_app.sh) と [redcap_configure.sh](/containers/redcap-docker-apache/scripts/redcap_configure.sh) で実行されます。
