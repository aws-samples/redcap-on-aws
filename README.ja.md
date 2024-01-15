JP | [EN](README.md)

# REDCap deployment on AWS with serverless services

[REDCap](https://projectredcap.org/) は、オンラインアンケートやデータベースを構築および管理するための安全なウェブアプリケーションです。特に、調査研究や業務におけるオンラインおよびオフラインのデータキャプチャをサポートすることを目的としています。

このプロジェクトは、AWS App Runner や Amazon Aurora Serverless などのオートスケーリング対応サービスを使用して、REDCap をデプロイおよび管理する方法を提供します。 このプロジェクトは[SST](https://sst.dev) を使用して構築されています。これは、すぐに使用できる多数のコンストラクタと、[IaC](https://docs.aws.amazon.com/whitepapers/latest/introduction-devops-aws/infrastructure-as-code.html) の開発をスピードアップできる多くの機能を備えた CDK ベースのフレームワークです。

> 以下のガイドはクイックスタートアップのガイドです。詳細なドキュメントについては [general documentation](./docs/ja/index.md) を参照してください。

## アーキテクチャ

以下は、オートスケーリングによる高可用性を実現するために設計されたサーバーレスアーキテクチャです。 アプリケーションの実行に必要な AWS リソースの分のみを支払う従量課金制モデルで利用でき、AWS Well-Architected Framework (<https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html>) に準拠しています。

![architecture_diagram](docs/images/architecture.png)

詳細アーキテクチャ図は[こちら](docs/images/architecture-detail.png)です。

### 特徴

#### 1. セキュリティ

1. **AWS WAF**: アプリケーションへのアクセスを制御するファイアウォール。REDCapにアクセスできるIP範囲を設定し、特定のエンドポイントへの不正アクセスをブロックできます。
2. **AWS Secrets Manager**: データベースや postfix 用の Amazon SES 認証情報などのサービスのシークレットを自動的に作成してローテーションします。
3. **Amazon VPC**: アプリケーションサーバーとデータベースはプライベートサブネットにデプロイされます。
4. **Amazon GuardDuty**: (Optional) AWS アカウント用のモニタリングおよび検出サービス。
5. **Amazon CloudWatch**: インフラストラクチャと REDCap の Apache アクセスログを監視します。
6. **AWS KMS**: ファイルストレージ、ログ、データベースなど、データは常に暗号化されて保存されます。

#### 2. サーバーレス

1. **AWS App Runner**: ロードバランサー、自動スケーリング、自動コンテナデプロイ機能を備えているため、REDCap をいつでも利用できる状態にします。
2. **Amazon Aurora Serverless**: MySQL との互換性を持ちながら、Aurora Serverlessは必要に応じてデータベースを自動スケーリングできます。 REDCap の MySQL リードレプリカの設定はデフォルトで有効になっています。
3. **Amazon S3**: ファイルストレージでは、REDCap と Amazon S3 の統合が推奨設定されており、デフォルトで有効になっています。

#### 3. AWS CDK を用いた IaC

[AWS CDK](https://aws.amazon.com/cdk/) を使用して、アーキテクチャのデプロイや更新と REDCap のソフトウェアアップデートをローカルマシンから行えます。

#### 4. 障害からの復旧

1. 特定の時点に「巻き戻す」ことでデータベースをバックトラックします。 デフォルト設定は 24 時間です。
2. 日次データベーススナップショット (バックアップ)
3. 障害または設定ミスした際のアプリケーションサーバーの自動ロールバック (blue-green deployment)
4. (Optional) Amazon S3 によるバージョン管理されたファイルストレージ

## License

このプロジェクトのライセンスは Amazon Software License([ASL](https://d1.awsstatic.com/legal/Amazon%20Software%20License/Amazon_Software_License__Japanese__04-18-2008.pdf)) に基づきます。

## REDCapアプリケーションのデプロイ

### 前提条件

デプロイ実行するローカルマシンに Node.jsバージョン、v18.16.1以上のインストールが必要です。[こちら](https://nodejs.org/en/download/package-manager)のパッケージマネージャーを利用してインストール可能です。

[yarn](https://yarnpkg.com/)の利用を推奨します。Node.jsをインストール後、以下のコマンドでインストール可能です。

```sh
npm -g install yarn
```

### 1. 依存関係のインストール

```sh
yarn install
```

### 2. stages.ts ファイルによるStage設定

提供しているサンプルファイルを以下のコマンドでコピーし、必要に応じて値を変更してください。

```sh
cp stages.sample.ts stages.ts
```

各プロパティは以下の通りで、デプロイの設定が可能です。

| プロパティ名         | 説明                                                                                                                                                                                                                                                             | Type    | Default                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| name                 | デプロイする環境ごとに付与する名前です。                                                                                                                                                                                                                         | String  | \* ユーザー定義                                       |
| profile              | AWS アカウントのプロファイルです。`~/.aws/config`に記載されているものを指定します。                                                                                                                                                                              | String  | \* ユーザー定義                                       |
| region               | Stack をデプロイする際に用いる AWS リージョンを指定します。                                                                                                                                                                                                      | String  | AWS config setting                                    |
| allowedIps           | REDCap アプリケーションに対して、アクセス元の IP を制限する場合、ここで許可する IP アドレスのリストを設定します。                                                                                                                                                | Array   | `['']`                                                |
| redCapLocalVersion   | デプロイする REDCap のバージョンを指定します。`packages/REDCap`ディレクトリに、`redcap${redCapLocalVersion}.zip`の形でファイルを配置する必要があります。下記の`redCapS3Path`プロパティを設定している場合、設定できません。                                       | String  | `undefined`(`redCapS3Path`が設定されている場合)       |
| redCapS3Path         | デプロイする REDCap のバージョンを指定します。あらかじめ、S3 上に zip 形式で REDCap アプリケーションをアップロードし、`${S3BucketName}/${S3ObjectKey}`の形でファイルの位置を指定します。上記の`redCapLocalVersion`プロパティを設定している場合、設定できません。 | String  | `undefined`(`redCapLocalVersion`が設定されている場合) |
| domain               | REDCap アプリケーションをホストする際に用いるドメイン名を指定します。                                                                                                                                                                                            | String  | `undefined`                                           |
| subDomain            | REDCap アプリケーションをホストする際に用いるサブドメインを指定します。                                                                                                                                                                                          | String  | `undefined`                                           |
| hostInRoute53        | ドメイン/サブドメインを Route53 に登録し、簡単に App Runner と SES のドメイン検証を行えるようにします。                                                                                                                                                          | Boolean | `true`                                                |
| email                | App Runner サービスステータスに関するメール通知を受け取るメールアドレスを指定します。また、ドメインが指定されていない場合、このメールアドレスを使って認証を行います。                                                                                            | String  | `undefined`                                           |
| appRunnerConcurrency | REDCap アプリケーションを動かす App Runner について、1 つのインスタンスが処理するリクエスト数の閾値を設定します。この値を超えると、インスタンスは自動で水平スケールします。                                                                                      | Number  | 10 (\*\*)                                             |
| appRunnerMaxSize     | REDCap アプリケーションを動かす App Runner について、インスタンススケール数の上限を設定します。                                                                                                                                                                  | Number  | 2                                                     |
| appRunnerMinSize     | REDCap アプリケーションを動かす App Runner について、インスタンススケール数の下限を設定します。                                                                                                                                                                  | Number  | 1                                                     |
| cronSecret           | `https:<your_domain>/cron.php`にアクセスするためのシークレットを作成するための元になる文字列を指定します。                                                                                                                                                       | String  | 'mysecret'                                            |
| cpu                  | インスタンスあたりの vCPU 数を指定します。                                                                                                                                                                                                                       | Cpu     | `Cpu.TWO_VCPU`                                        |
| memory               | インスタンスあたりのメモリ容量を指定します。                                                                                                                                                                                                                     | Memory  | `Memory.FOUR_GB`                                      |
| phpTimezone          | 例: 'Asia/Tokyo', <https://www.php.net/manual/en/timezones.php>                                                                                                                                                                                                  | String  | `UTC`                                                 |
| port                 | App Runnerで使用されるポート番号です。                                                                                                                                                                                                                           | String  | `UTC`                                                 |

- サービス通知: **email**を指定すると、AWS App Runnerサービス通知をサブスクライブするためのメールを受信できます。(サービスのデプロイや変更が通知されます)

- `hostInRoute53`を有効にすると、Route53 DNS レコードが作成され、SES の ID と App Runner の証明書の検証が行われます。これを指定しない場合は、SES と App Runner を独自の DNS プロバイダで手動で検証する必要があります。

- (\*) 必須
- (\*\*) 同時実行のデフォルト値は 10 です。これは、2vCPU と 4GB の 1 つのインスタンスで最小負荷テストを行った結果によるものです。 負荷の監視を行い、使用状況に応じてこの値を調整することをお勧めします。

### 3. REDCap の基本的設定

デプロイを行う前に、REDCap に関する基本的な設定を行います。

```sh
yarn gen redcap config
```

上記のコマンドを入力すると、対話式で設定を行うことができます。

![genConfigSQL](docs/images/genConfigSQL.png)

この設定は、データベースの`redcap_config`テーブルに保存され、App Runnerインスタンスをアップデートするごとにアップデートできます。

### 4. デプロイの実行

以下のコマンドでデプロイを実行します。

```sh
yarn deploy --stage <your_stage_name>
```

> 警告: 一度に複数のステージ/環境をデプロイしないでください。

デプロイが完了すると、次のような表示になります。

![stackOutput](docs/images/stackOutput.png)

### 5. ドメイン設定

stages.ts ファイルに `hostInRoute53`を設定していれば、所有している外部ドメインを デプロイ時にREDCap に紐付けるることができます。この方法にはいくつかのオプションがあります。

1. REDCap で使用したい DNS が別の DNS プロバイダーでホストされている場合は、ドメインプロバイダーのウェブサイトにアクセスし、ステップ 4 でデプロイした後のコンソール出力に表示されるネームサーバーを含む`NS`レコードを追加します。 デプロイを実行。

   ```yml
   Example
   NameServers: ns-11111.awsdns-11.org,ns-22.awsdns-22.com,ns-333.awsdns-33.net,ns-4444.awsdns-44.co.uk
   ```

   この `NS`エントリのレコード名は、`stages.ts`ファイルの `domain`設定と同じでなければなりません。 しばらくすると、App Runner はドメインの証明書を検証します。 これには 24〜48 時間かかりますが、ほとんどの場合、それ以下の時間で完了します。

2. ドメインを所有していない場合は、次の 2 つの選択肢があります。
   - 提供されている App Runner のデフォルト DNS の使用
   - [Amazon Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html) への DNS 登録

Route53 を使用せずに所有しているドメインをリンクしたい場合は、外部 DNS プロバイダーで Amazon SES ID と AWS App Runner 証明書を手動で確認する必要があります。 そのためには、各サービスの AWS マネジメントコンソールに従ってください。
詳細は[Amazon SES の ID の作成と検証](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)、[App Runner サービスのカスタムドメイン名の管理](https://docs.aws.amazon.com/apprunner/latest/dg/manage-custom-domains.html)をご確認ください。

また、このプロジェクトでは Amazon Route 53 で管理されるドメインに対する NS の追加もサポートしています。

1. 初回のデプロイを完了させ、 `NameServers` として出力される NS レコードに指定すべき値をコピーします。
2. `stages.ts` ファイルを編集して、コピーした NS レコードをペーストすることで Route53 に対する設定を行います。例としては次のようになります。

   ```ts
   const route53NS: DomainAppsConfig = {
   ...baseOptions,
   profile: 'your_aws_profile',
   region: 'your_aws_region',
   apps: [
      {
         name: 'prod',
         nsRecords: [
         'ns-sample.co.uk',
         'ns-sample.net',
         'ns-sample.org',
         'ns-sample.com',
         ],
      },
      {
         name: 'stag'
         nsRecords: [...]
      }
   ],
   domain: 'mydomain.com',
   };
   ```

   > デプロイした異なる環境に対して、複数の application（apps） を追加することができます。

3. NS レコードを作成するスタックをデプロイします。

   `yarn deploy --stage route53NS`

### 6. Amazon Simple Email Service (SES) のproduction設定

デフォルトでは、Amazon SES は sandbox モードでデプロイされます。 AWS コンソールから production アクセスをリクエストできます。 詳細は [こちら](./docs/ja/ses.md)をご確認ください。

デフォルトでは、`MAIL FROM domain` が `mail.<your_domain.com>` の形式であることを前提としています。 そうでない場合は、[Backend.ts](./stacks/Backend.ts) の `mailFromDomain` を `SimpleEmailService` コンストラクタに渡し、独自の形式を指定できます。

## REDCap バージョンの更新

> **以下の操作は、本番環境で行う前に、必ず別の開発用環境を作成しテストを行なってください。 [開発環境のセットアップ](./docs/ja/devenv.md)**

### 1. stages.ts ファイルの更新

`stages.ts` ファイル内のアップデートしたい環境の `redCapLocalVersion`または `redCapS3Path` を新しいバージョンに変更します。`redCapLocalVersion` を使用し、ローカルにある REDCap をデプロイする場合は、 `packages/REDCap/releases` ディレクトリに、`redcap${redCapLocalVersion}.zip`の形でファイルを配置します。例えば、`packages/REDCap/releases/redcap13.7.2.zip` のようになります。

### 2. アップデート

初回のデプロイと同様に、以下のコマンドを実行します。

> **注意**
> REDCap内部のアップグレードメカニズムは使用しないでください。これは一つのコンテナをだけアップデートするのもので、AWS App Runner上で稼働している全てのコンテナをアップデートしません。

```sh
yarn deploy --stage <your_stage_name>
```

コマンドでデプロイを実行します。

### 3. コンテナのビルドとデプロイの実行

AWS CodeBuildにより新しいDockerイメージをビルドし、新しいイメージをAWS App Runnerにデプロイします。実行するには、2つのオプションがあります。

#### 3.1 AWS Management Console

1. AWS Management Console に移動します。
2. CodeBuild の画面に遷移し、 Build Projects を選択します。
3. プロジェクトを選択し、`Start Build`を押します。

#### 3.2 AWS CLI から AWS Lambdaを呼び出す

1. ターミナルの出力 `UpdateDeploymentCommand` を確認し、コマンドをコピーします
2. 貼り付けて実行し、AWS CLI を呼び出し、更新とデプロイを開始します。

ステータスをモニタリングするには、AWS CLI を使用するか、AWS Management Consoleにアクセスして AWS CodeBuildで確認し、後で AWS App Runner のブルーグリーンデプロイを確認します。

> この Lambda 関数の実行は、プロジェクトを初めてデプロイするときにのみ自動的に呼び出されることに注意してください。 それより後の実行はサービスの`アップデート`と見なされ、自動的には行われず段階的に行われるように設計されています。

### 4. REDCap のアップグレードを実行する

> このコマンドを実行する前に、データベースのスナップショットを作成するか、障害が発生した場合に備えて [Aurora バックトラックウィンドウ機能](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Managing.Backtrack.html)に慣れておくことをお勧めします。

デプロイが完了したら、`https://<your_domain>/upgrade.php?auto=1`にアクセスすることで、データベースが更新/移行されます。

または、`https://<your_domain>/upgrade.php` にアクセスし、 `Option A` 、 `Upgrade` の順にクリックすることでもデータベースを更新できます。

### 5. REDCap Control center を確認する

デプロイ後に表示される警告はほとんどありません。以下は表示されていても正常です。

1. 最新のREDCapバージョンをデプロイしていない場合、`Some non-versioned files are outdated -` と表示されます。
2. `MYSQL DATABASE CONFIGURATION-` に関して、REDCap が推奨する設定の一部は、メモリ不足エラーが発生する可能性があるため、注意して実行する必要があります。 ユースケースを確認してください。パラメータを変更する必要がある場合は、[database stack](./stacks/Database.ts) で実行できます。
3. `Internal Service Check: Checking communication with the REDCap survey end-point -` が表示されますが、これは、このテストは AWS WAF にブロックされる方法で実行されるためです。`https://your_domain/surveys/` には通常のブラウザからアクセスできるはずです。 このチェックは AWS WAF コンソールで `AWS#AWSManagedRulesCommonRuleSet#NoUserAgent_HEADER`によってブロックされていることを確認できます。
4. MyCap `NOT making API Call - CRITICAL -` のテストも `3.` と同様にAWS WAFによってブロックされています。

詳細に関しては[本番環境への移行](./docs/ja/ptp.md)も合わせて参照してください。

## 環境の削除

環境を削除するには、以下のコマンドを実行します。

```sh
yarn destroy --stage <your_stage_name>
```

デフォルトでは、このコマンド実行時にデータベースのスナップショットが作成されます。
