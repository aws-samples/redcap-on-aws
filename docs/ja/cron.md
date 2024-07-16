JP | [EN](../en/cron.md)

# REDCap cronジョブ セットアップ

REDCapでは、このcronジョブはREDCapデプロイの際に毎分実行されるよう設定されています。
REDCapのインストールを複数のインスタンスやサーバ(1台以上)にスケールする場合、全てのサーバーでcronジョブコマンドが実行されるため、本設定は最適ではありません。
これを防ぐために、本プロセスを切り出して、外部から呼び出すようにしています。

REDCapの機能により、サービスエンドポイント(例えば、<https://your_domain.com/cron.php>)を実行することでジョブ実行できます。デフォルトでは、このエンドポイントは認可なしでアクセスできてしまいますが、共用シークレットを追加することで外部からの実行を防止しています。

## Amazon EventBridgeのセットアップ

Amazon EventBridgeを利用することで、安全にエンドポイントに対してHTTPリクエストで `schedule`できます。本実装の詳細は[Backend.ts](../../stacks/Backend.ts)ファイルをご確認ください。

まず、`ApiDestination`コンストラクタに必要な`Connection`オブジェクトを作成します。このオブジェクトにはダミーのベーシック認証があり、REDCapサーバーには不要ですが、コンストラクタの作成には必要です。

```ts
const connection = new aws_events.Connection(stack, 'redcap-connection', {
  authorization: aws_events.Authorization.basic(
    'nouser',
    SecretValue.unsafePlainText('nopassword'),
  ),
});
```

宛先は、EventBridgeとWAFのみが知っている追加のカスタムシークレットを含むサービスURLになります。

```ts
const destination = new aws_events.ApiDestination(stack, 'redcap-destination', {
  connection,
  endpoint: `${ServiceUrl}/cron.php?secret=${searchString}`,
  httpMethod: HttpMethod.GET,
});
```

1分毎に実行するよう以下のようにスケジュール設定しています。

```ts
const rule = new aws_events.Rule(stack, 'redcap-cron', {
  schedule: aws_events.Schedule.rate(Duration.minutes(1)),
  targets: [new ApiDestination(destination)],
});
```

## WAFとIPフィルタリング

WAFの設定によりREDCapアクセスを特定のIPのみにフィルタリングできます。しかし、Amazon EventBridgeが常に外部から<https://your_domain.com/cron.php>のURLにアクセスできるようにアクセス許可が必要です(EventBridgeのIPを特定はできません)。そのため、AWS WAFのルールを[WafExtraRules.ts](../../stacks/Backend/WafExtraRules.ts)のように実装しています。

実際、`cron.php`エンドポイントは、たとえIPフィルタリングを有効化していても常に公開されていますが、共有シークレットを介したEventBridgeアクセスのWAFルールにより保護されています。仮にインターネットのユーザーがこのエンドポイントを実行した場合、WAFがシークレットパラメータを検証し、リクエストを拒否します。また、この設定は、潜在的なDoS攻撃を防ぐ観点でも設定しています。

シークレットはデプロイ実行のたびに自動生成され、アップデートされます。
