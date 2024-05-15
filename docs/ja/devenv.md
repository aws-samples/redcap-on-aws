JP | [EN](../en/devenv.md)

# 開発環境のセットアップ

この開発環境はデプロイ時に本番環境といくつかの違いがあります。

> 本環境で機微なデータは利用しないでください

## 本番環境とのアーキテクチャの違い

### SST Console

[SST](https://docs.sst.dev/learn) はCDKで動作するフレームワークです。`development`利用時は、ご自身のAWS環境ににデプロイされたリソースに接続されたウェブアプリケーションであるSST Consoleにアクセスできます。SST ConsoleからREDCapデータベースへのクエリやREDCapの新しいバージョンのデプロイ(Lambda経由)やテストが可能です。

### ホットリロードサポート

CDKのコード変更により(エディターで保存した際)、AWS上にデプロイされているアーキテクチャのアップデートが実行されます

## セットアップ

1. `stages.ts`で、`dev`と呼ばれる新しいステージ設定を作成します。 以下は、App Runnerを最小インスタンス数で設定した例になります。

   ```ts
   const dev: RedCapConfig = {
       ...baseOptions,
       redCapS3Path: 'redcap/redcap13.7.2.zip',
       domain: 'redcap.domain.dev',
       cronSecret: 'mysecret',
       appRunnerConcurrency: 25,
       appRunnerMaxSize: 2,
       appRunnerMinSize: 1,
       cpu: Cpu.TWO_VCPU,
       memory: Memory.FOUR_GB,
   };

   ...

   export { prod, stag, dev };
   ```

2. (推奨)新規のAWSアカウントにデプロイします。一つのAWSアカウントに複数の環境をデプロイすることができますが、`dev`と`production`はアカウントを分離(異なるAWSアカウント)してデプロイすることを推奨します。 `dev`アカウントのAWS profile設定に関しては、[こちら](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)を参照ください。
3. 依存関係のインストール

   ```sh
   yarn install
   ```

4. 開発環境の起動

   ```sh
   yarn dev --stage dev
   ```

5. ターミナルの出力結果を確認すると、SST Consoleのアクセスリンクが表示されます。例) <https://console.sst.dev/REDCap/dev>
