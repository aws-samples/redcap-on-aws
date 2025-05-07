JP | [EN](../en/ptp.md)

# 本番環境への移行

1. ユーザー数とシステムへの負荷が不確定な状態では、まずは App Runner が適切にスケールするためのパラメータを設定することから始めましょう。あとで`minSize`をより小さな値にするなど、この値を変更することでコストの最適化ができます。1 インスタンスあたりおよそ 7USD の削減になります。`MaxSize`はコストと予算の管理の観点からも重要です。こちらもシステムの負荷に応じて調整します。

2. REDCap は CPU を多く消費するソフトウェアです。デフォルト設定では、各インスタンスあたり 2vCPU を使用しますが、4vCPU/8 GB のインスタンスにスケールアップする方が良い場合もあります。これは、システム運用開始後にメトリクスを監視して決定します。

3. REDCap をアップグレードします。このプロジェクトでは、システムのダウンタイムやデータ損失を防ぐために、これを一連の手順で構成しています。 REDCap のアップグレードが必要な際にこの手順を実行する担当者を割り当てることをお勧めします。

4. REDCapの主なデータストレージはデータベースとS3です。 Amazon RDS Aurora では、5 時間のタイムウィンドウバックトラックなど、いくつかのバックアップオプションとディザスタリカバリの機能がデフォルトで有効になっています。 一方、S3は信頼性に優れていますが、デフォルトではファイルのバックアップや履歴の保持は行いません。 このプロジェクトでは、デフォルトで `versioning` が有効になっています。 これは、[Backend.ts](../../stacks/Backend.ts) で無効にできます。:

   ```ts
   ...bucketProps(app.stage === 'prod', false), // 二つ目のパラメーターを false に設定します。
   ```

5. 現時点では (2024年1月)、CDK と CloudFormation は App Runner 用のカスタムドメインの作成をサポートしていません。 このプロジェクトでは、この機能をサポートするための回避策が実装されています。サポートがリリース (<https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1092>) された場合は、この機能をリファクタリングすることをお勧めします。

6. SSTはオープンソースプロジェクトであり、改善のためにマシン情報 (AWS とは無関係に) の匿名データを収集します。 ただし、次の手順で無効にできます。<https://docs.sst.dev/anonymous-telemetry>

7. SST を最新バージョンに保ちましょう。 SST と CDK をアップグレードするには、以下を実行します。

   1. `yarn sst update <version> --stage <your_stage>` ステージ名は何でも構いません。

   2. `yarn install`

8. REDCap には、`install.php`, `upgrade.php`, `cron.php` のように、許可なくアクセスされるエンドポイントがいくつかあります。 最後の `cron.php `は既にWAFとEventBridgeによってこの2つのリソースだけが知っている秘密の値で保護されています。このエンドポイントは多くの関数をトリガーするので、初めに保護すべきです。ただし、WAFを使用していない場合は、サーバーアクションをトリガーする他のパブリックエンドポイントを保護するために、同じ手法を取り入れることをお勧めします。

9. このプロジェクトで使用している Amazon S3、Amazon RDS、AWS Lambda の Amazon GuardDuty を有効化してください。 CDK は GuardDuty サービスを自動的に有効にしますが、これら 3 つのサービスを AWS コンソールで手動で有効にする必要があります。 CloudFormation サポートが追加されると (<https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-guardduty-detector-cfndatasourceconfigurations.html>)、CDK を介してこれらのサービスを有効にすることができます。

10. REDCapの IAMユーザー Access keyは、Amazon S3やAmazonSESを用いたEmailサービスのためにローテーションする必要があります。 REDCapに必要な設定は、これらのサービスにアクセスキーを渡すことです。そのため、この認可をIAMベースのアクセスポリシーに移行することを推奨します。詳細は [こちら](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)を参照ください。

11. データベース認証はユーザー/パスワードではなく、IAMを利用しています。パスワードでのアクセスを利用しないことで、パスワードの漏洩を防ぐといったセキュリティを強化できます。本番環境では、本設定がREDCapの接続に問題がないかをテストすることを推奨します。本アプローチは、通常透過的で、アプリケーションへの変更が最小限ですみます。データベースのIAM認証については、[こちら](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html)を参照ください。

12. REDCapのコードベースレビューを実施してください。このシステムはアウトバウンドの外部通信が許可されており、REDCapサーバーがインターネットサービスと通信できます。REDCapの一部機能(例えば短縮URL)はこの設定により動作するため、デフォルトで設定されています。しかし、統計情報を共有したり、外部サービスとの通信を許可することは、データベースに格納している秘匿な資格情報が漏洩するバックドアになる可能性があります。そのため、コードの変更を追跡し、REDCapのコードがこれらの秘匿情報を送信していないか検証することが重要です。

13. Amazon Auroraは、ほとんどのアプリケーションで動作するデフォルト設定でデプロイされており、これらの設定を変更するには、MySQL と Aurora に関する高度な知識が必要です。REDCap の Configuration Check では、いくつかのパラメータに関して警告が表示されますが、パフォーマンスに問題がある場合は、これらのパラメータを変更することをお勧めします。詳しくは、[Amazon Aurora MySQL データベース設定のベストプラクティス](https://aws.amazon.com/blogs/database/best-practices-for-amazon-aurora-mysql-database-configuration/)と[ParameterGroup - AWS CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.ParameterGroupProps.html)をご覧ください。

もし、警告表示を防ぎたい場合、[Database.ts](../../stacks/Database.ts)に以下のコードを追加し、REDCapに合わせた設定を行うことで表示を防ぐことができます。ただし、これは Amazon Aurora としては推奨されないものであり、問題がない場合は Amazon Aurora の規定値で運用することをおすすめします。
パラメーターグループの変更を行なった際は、設定値を変更してデプロイした後に、設定をDBに反映するためDBの再起動を実施してください。再起動については[こちら](https://docs.aws.amazon.com/ja_jp/AmazonRDS/latest/AuroraUserGuide/USER_RebootCluster.html)を参照ください。

```ts
parameterGroupParameters: {
        // Avoid the REDCap system warning. Please change to the required value
        max_allowed_packet: '1073741824',
        read_rnd_buffer_size: '262144',
        sort_buffer_size: '2097152',
},
```

別の方法として、`stages.ts`ファイルの`db`オブジェクトで`maxAllowedPacket: '1073741824'`を設定することができます。
