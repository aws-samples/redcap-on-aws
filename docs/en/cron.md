[JP](../ja/cron.md) | EN

# REDCap cronjob setup

In REDCap this cronjob is configured to run every minute inside your REDCap deployment. This is not optimal if you have your installation scaled to multiple instances/servers (more than 1), as all the servers will be executing this command. To prevent this, this process has been externalized and it's remotely called.

Thanks to a feature in REDCap, you can trigger this procedure by executing your service endpoint, for example: <https://your_domain.com/cron.php>. This endpoint has by default un-authorized access, but we have added a shared secret to prevent public execution.

## Setup Amazon EventBridge

This service will allow us to `schedule` an HTTPS call to our endpoint in a secure way. The implementation details of this are in the [Backend.ts](../../stacks/Backend.ts) file

We first create a connection object, that is required for the ApiDestination constructor. This connection has a dummy basic authorization that is not used by the REDCap server, but required by this constructor.

```ts
const connection = new aws_events.Connection(stack, 'redcap-connection', {
  authorization: aws_events.Authorization.basic(
    'nouser',
    SecretValue.unsafePlainText('nopassword'),
  ),
});
```

The destination is your service URL with an additional custom secret that only EventBridge and WAF knows.

```ts
const destination = new aws_events.ApiDestination(stack, 'redcap-destination', {
  connection,
  endpoint: `${ServiceUrl}/cron.php?secret=${searchString}`,
  httpMethod: HttpMethod.GET,
});
```

We schedule the call to happen every one minute

```ts
const rule = new aws_events.Rule(stack, 'redcap-cron', {
  schedule: aws_events.Schedule.rate(Duration.minutes(1)),
  targets: [new ApiDestination(destination)],
});
```

## About WAF and filtered Ips

You can setup WAF with filtered IPs limiting access to your REDCap setup. However, we need to allow access to Amazon EventBridge to always access the URL <https://your_domain.com/cron.php> from public access (it's not possible to determine the IP of the EventBridge call). The AWS WAF rules implementation for this is here [WafRuleForCron.ts](../../stacks/Backend/WafRuleForCron.ts)

In practice, the cron.php endpoint is always public, even with filtered IPs enabled, but with protected via the WAF rule access for EventBridge via a shared secret. If an Internet user tries to execute this endpoint, WAF will validate the secret parameter and deny the request to the service. This is also in place to prevent a potential DoS attack.

The secret is auto-generated and updated every time you execute a deploy.
