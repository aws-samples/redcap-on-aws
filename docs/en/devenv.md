[JP](../ja/devenv.md) | EN

# Setup development Environment

This environment has a few differences when is deployed.

> Do not put any sensible data on this environment

## Architecture differences vs production

### SST Console

[SST](https://docs.sst.dev/learn) is a framework that works with CDK. While using `development` mode, you can access the SST console that is a webapp connected to your AWS deployed resources for this environment. From here, you can query your REDCap's database, deploy new versions of REDCap (via lambda functions) and testing.

### Hot reload support

CDK code changes (saving in the editor) will trigger an update in your architecture.

## SETUP

1. In your `stages.ts` create a new stage configuration called `dev`. For example: You can start with a config with the min number of App Runner instances.

   ```ts
   const dev: RedCapConfig = {
       ...baseOptions,
       redCapS3Path: 'redcap/redcap13.7.2.zip',
       domain: 'redcap.mydomain.dev',
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

2. Deploy in a new account (recommended). Even though you could deploy as many environments in one AWS account, its recommended that your `dev` and `production` are in separated accounts. With regard to setup a profile for your `dev` account, plase see [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)

3. Install dependencies

   ```sh
   yarn install
   ```

4. Start dev env

   ```sh
   yarn dev --stage dev
   ```

5. Look at your terminal output, SST will provide an access link to the console. e.g <https://console.sst.dev/REDCap/dev>
