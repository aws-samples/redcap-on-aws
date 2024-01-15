JP | [EN](../en/salt.md)

# REDCap database ソルト

REDCap のインストールには、データベースのソルトが必要で、これは暗号化されたコンテンツの作成に使用する生成された文字列です。この値は、秘匿情報であり、データベースまたはインストールのリカバリの際に重要な値です。

> たとえREDCapのインストールを削除またはデプロビジョニングした場合でも、プロジェクトはこのシークレットを保持するよう設定されています。これにより、災害発生時でも復旧が可能になります。

## シークレットの作成

AWS CDKはランダムな文字列のシークレットを自動生成し、AWS Secrets Managerにシークレットを格納します。

## シークレットの受け渡し

シークレットは環境変数によりAWS App Runnerで実行中のコンテナに渡されます。REDCapの起動前に、この値は[start_services.sh](../../containers/redcap-docker-apache/scripts/start_services.sh)のハッシュ関数を使用して、文字と数字(REDCap推奨に従い)に正規化されます。

```sh
DB_SALT_ALPHA=$(echo -n "$DB_SALT" | sha256sum | cut -d' ' -f1)
```

この値は後ほどREDCapで利用するために `database.php`に渡されます。
