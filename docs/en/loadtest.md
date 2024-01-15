[JP](../ja/loadtest.md) | EN

# Load testing with Locust

In this project, a simple load test with Docker Compose is included [here](../../loadtest/locust/)

To run it, you must have docker installed in your machine.

Then you must do:

1. Go to the locust folder

   ```sh
   cd ./loadtest/locust
   ```

2. Start Locust

   ```sh
   docker-compose up
   ```

3. Open the tool in your browser: <http://0.0.0.0:8089>

Inside the tool, you can start a new test adding the endpoint of your REDCap installation you wish to test.

## Considerations to execute the load test

1. AWS WAF is configured with a default of 3000 request. You can disable WAF or increase this number to perform the test.

2. REDCap's internal system has a number of request per client, this can be disabled in the configuration panel.
