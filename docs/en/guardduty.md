[JP](../ja/guardduty.md) | EN

# Enable Amazon GuardDuty

Amazon GuardDuty is a security monitoring service that continuously monitors and detects potential threats with machine learning, discover of unusual pattern and intelligent threat detection. From the perspective of security, we recommnend to enable it in your AWS account.

> ### Warn
>
> The Enable setting is just required once per your AWS Account.
> Therefore, no need to enable it if someone enable it in your environment.

It is disabled by default, so please uncomment the security stack in [sst.config.ts](../../sst.config.ts) as follows when you run the deployment.

```sst.config.ts
/****** Stacks ******/
app.stack(Network);
app.stack(BuildImage);
app.stack(Database);
app.stack(Backend);
// Optional - enables AWS Guard-duty
app.stack(Security);  <- Uncomment
```
