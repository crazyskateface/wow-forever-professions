import {
  CfnCondition,
  CfnOutput,
  CfnParameter,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import path from "node:path";
import * as dsql from "aws-cdk-lib/aws-dsql";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

export const DATA_CLUSTER_ENDPOINT_PARAMETER_NAME =
  "/forever-professions/data/dsql-endpoint";
export const DATA_CLUSTER_IDENTIFIER_PARAMETER_NAME =
  "/forever-professions/data/dsql-identifier";

export class ForeverProfessionsDataStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const rawDataBucket = new s3.Bucket(this, "RawDataBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });

    const dataCluster = new dsql.CfnCluster(this, "DataCluster", {
      deletionProtectionEnabled: true,
      tags: [
        { key: "Project", value: "forever-professions" },
        { key: "Purpose", value: "versioned-profession-data" },
      ],
    });
    dataCluster.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const ingestionRole = new iam.CfnRole(this, "IngestionRole", {
      description: "Scoped local-development access for the Phase 2 ingestion pipeline.",
      maxSessionDuration: Duration.hours(1).toSeconds(),
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: this.formatArn({ service: "iam", region: "", resource: "root" }),
            },
            Action: "sts:AssumeRole",
          },
        ],
      },
      policies: [
        {
          policyName: "Phase2DataWrite",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "dsql:DbConnect",
                Resource: dataCluster.attrResourceArn,
              },
              {
                Effect: "Allow",
                Action: "s3:PutObject",
                Resource: `${rawDataBucket.bucketArn}/raw/*`,
              },
            ],
          },
        },
      ],
      tags: [
        { key: "Project", value: "forever-professions" },
        { key: "Purpose", value: "phase-2-ingestion" },
      ],
    });

    new ssm.StringParameter(this, "DataClusterEndpointParameter", {
      parameterName: DATA_CLUSTER_ENDPOINT_PARAMETER_NAME,
      stringValue: dataCluster.attrEndpoint,
      description: "Aurora DSQL endpoint for Forever Professions application runtimes.",
    });
    new ssm.StringParameter(this, "DataClusterIdentifierParameter", {
      parameterName: DATA_CLUSTER_IDENTIFIER_PARAMETER_NAME,
      stringValue: dataCluster.ref,
      description: "Aurora DSQL cluster identifier for Forever Professions.",
    });

    const pricingWorkerLogGroup = new logs.LogGroup(this, "PricingWorkerLogGroup", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const auctionMarketId = new CfnParameter(this, "AuctionMarketId", {
      type: "String",
      default: "forever.pvp.horde.us",
      description: "AH Ledger market refreshed by the Phase 3 worker.",
    });
    const auctionItemIds = new CfnParameter(this, "AuctionItemIds", {
      type: "String",
      default: "4234,2321,4304,4291",
      description: "Comma-separated game item IDs refreshed by the Phase 3 worker.",
    });
    const pricingWorker = new lambdaNodejs.NodejsFunction(this, "PricingWorker", {
      entry: path.join(__dirname, "../../apps/pricing-worker/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(45),
      reservedConcurrentExecutions: 1,
      logGroup: pricingWorkerLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node24",
      },
      environment: {
        AUCTION_ITEM_IDS: auctionItemIds.valueAsString,
        AUCTION_MARKET_ID: auctionMarketId.valueAsString,
        DSQL_ENDPOINT: dataCluster.attrEndpoint,
        NODE_OPTIONS: "--enable-source-maps",
        PRICING_DATABASE_ROLE: "forever_professions_pricing_writer",
      },
    });
    pricingWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dsql:DbConnect"],
        resources: [dataCluster.attrResourceArn],
      }),
    );

    const refreshDeadLetterQueue = new sqs.Queue(this, "PricingRefreshDeadLetterQueue", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const scheduleName = "forever-professions-auction-refresh";
    const scheduleGroupArn = this.formatArn({
      service: "scheduler",
      resource: "schedule-group",
      resourceName: "default",
    });
    const scheduleRole = new iam.Role(this, "PricingScheduleRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com", {
        conditions: {
          ArnEquals: { "aws:SourceArn": scheduleGroupArn },
          StringEquals: { "aws:SourceAccount": this.account },
        },
      }),
    });
    pricingWorker.grantInvoke(scheduleRole);
    refreshDeadLetterQueue.grantSendMessages(scheduleRole);

    const enableAuctionRefreshSchedule = new CfnParameter(
      this,
      "EnableAuctionRefreshSchedule",
      {
        type: "String",
        allowedValues: ["true", "false"],
        default: "false",
        description: "Enable the validated Phase 3 EventBridge Scheduler refresh.",
      },
    );
    const auctionRefreshScheduleEnabled = new CfnCondition(
      this,
      "AuctionRefreshScheduleEnabled",
      {
        expression: Fn.conditionEquals(
          enableAuctionRefreshSchedule.valueAsString,
          "true",
        ),
      },
    );
    const auctionRefreshScheduleExpression = new CfnParameter(
      this,
      "AuctionRefreshScheduleExpression",
      {
        type: "String",
        default: "rate(15 minutes)",
        description: "EventBridge Scheduler rate or cron expression for auction refreshes.",
      },
    );
    const auctionRefreshSchedule = new scheduler.CfnSchedule(
      this,
      "PricingRefreshSchedule",
      {
        name: scheduleName,
        scheduleExpression: auctionRefreshScheduleExpression.valueAsString,
        flexibleTimeWindow: { mode: "FLEXIBLE", maximumWindowInMinutes: 5 },
        target: {
          arn: pricingWorker.functionArn,
          roleArn: scheduleRole.roleArn,
          deadLetterConfig: { arn: refreshDeadLetterQueue.queueArn },
          retryPolicy: {
            maximumEventAgeInSeconds: 3600,
            maximumRetryAttempts: 2,
          },
          input: JSON.stringify({ source: "forever-professions.schedule" }),
        },
      },
    );
    auctionRefreshSchedule.cfnOptions.condition = auctionRefreshScheduleEnabled;

    new CfnOutput(this, "RawDataBucketName", { value: rawDataBucket.bucketName });

    new CfnOutput(this, "DataClusterIdentifier", {
      value: dataCluster.ref,
    });

    new CfnOutput(this, "DataClusterEndpoint", {
      value: dataCluster.attrEndpoint,
    });

    new CfnOutput(this, "IngestionRoleArn", {
      value: ingestionRole.attrArn,
    });
    new CfnOutput(this, "PricingWorkerFunctionName", {
      value: pricingWorker.functionName,
    });
    new CfnOutput(this, "PricingWorkerRoleArn", {
      value: pricingWorker.role!.roleArn,
    });
    const pricingRefreshScheduleName = new CfnOutput(
      this,
      "PricingRefreshScheduleName",
      {
        value: scheduleName,
      },
    );
    pricingRefreshScheduleName.condition = auctionRefreshScheduleEnabled;
  }
}
