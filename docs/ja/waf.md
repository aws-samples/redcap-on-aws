JP | [EN](../en/waf.md)

# AWS WAF

AWS WAFは一般的な攻撃からウェブアプリケーションを保護するウェブアプリケーションファイアウォールで、セキュリティルールを利用してトラフィックを保護します。これはデプロイした全ての環境で有効化されます。

### IPフィルタリング

セキュリティ強化のため、特定のIPリスト(例えば、キャンパスのCIDR)からのみアクセス可能といった、REDCapアプリケーションへのアクセス制限の設定を推奨します。`stages.ts`ファイルの `allowedIps`に以下のように設定することで、一つ以上のCIDRアドレスを追加できます。

```ts
allowedIps: ['118.1.0.0/24'],
```

### AWS WAF マネージドルール

AWS WAFのマネージドルールで一般的なアプリケーションの脆弱性や他の不要なトラフィックからアプリケーションを保護できます。 本プロジェクトでは、[Waf.ts](../../prototyping/constructs/Waf.ts)で`Baseline rule groups`、`IP reputation rule groups`と`Use-case specific rule groups`から下記のルールを実装しています。必要に応じて[AWS WAF rules documentation](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rules.html)をご確認ください。

- AWSManagedRulesCommonRuleSet
- AWSManagedRulesKnownBadInputsRuleSet
- AWSManagedRulesSQLiRuleSet
- AWSManagedRulesAmazonIpReputationList

### カスタムコントロール

#### レートコントロール

レートベースのルールは、受信リクエストをカウントし、リクエスト速度があまりにも速い場合は、レート制限をリクエストします。[Waf.ts](../../prototyping/constructs/Waf.ts)のレートベースのルールで、クライアントが30秒間に3000を超えるリクエストを実行した場合に、サービスが正常に動作できるよう保護します。

#### シークレットベースのアクセスコントロール

これはREDCapアプリケーションの`cron.php`へのアクセスコントロールです。詳細は [REDCap cronジョブ セットアップ](./cron.md)をご確認ください。

#### 新しいルールを導入する場合のコード例

もし、URL パスベースとレートベースの組み合わせでルールを適用したい場合は次のようにします。

```ts
  // This waf rule is an example of a rate limit on the specific path of url. In practice, it does not make much sense because REDCap will render the login UI at any URL when you are not logged in.
  {
    name: 'rate-limit-specific-url',
    rule: {
      name: 'rate-limit-specific-url',
      priority: 50,
      statement: {
        rateBasedStatement: {
          limit: 100,
          aggregateKeyType: 'IP',
          scopeDownStatement: {
            byteMatchStatement: {
              fieldToMatch: {
                uriPath: {},
              },
              positionalConstraint: 'EXACTLY',
              searchString: '/',
              textTransformations: [
                {
                  type: 'NONE',
                  priority: 0,
                },
              ],
            },
          },
        },
      },
      action: {
        block: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'rate-limit-specific-url',
      },
    },
  },
```

これは `/` パスに対して、IP ベースで 5 分あたり 100 のレートリミットをかける例です。
ログインページなどでより強固なレートリミットをかけたい場合に有効ですが、REDCapではどのURLであっても未ログイン状態ではログイン画面を表示してしまうので実際にはあまり意味がありません。
