import {
  CfnCondition,
  CfnOutput,
  CfnParameter,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  Validations,
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
import type { DeploymentConfig } from "./deployment-config";

export interface ForeverProfessionsDataStackProps extends StackProps {
  readonly deployment: DeploymentConfig;
}

export class ForeverProfessionsDataStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ForeverProfessionsDataStackProps,
  ) {
    const { deployment, ...stackProps } = props;
    super(scope, id, stackProps);

    const rawDataBucket = new s3.Bucket(this, "RawDataBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });
    Validations.of(rawDataBucket).acknowledge({
      id: "AwsSolutions::AwsSolutions-S1",
      reason:
        "The retained raw-data bucket is private, accepts writes only from the scoped ingestion role, and keeps immutable source objects. S3 access logging is deferred with the low-cost observability work in deployment roadmap Phase 6.",
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
      description: "Scoped write access for the Forever Professions ingestion pipeline.",
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
          policyName: "CatalogDataWrite",
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
                Resource: [
                  `${rawDataBucket.bucketArn}/raw/*`,
                  `${rawDataBucket.bucketArn}/releases/data/*`,
                ],
              },
            ],
          },
        },
      ],
      tags: [
        { key: "Project", value: "forever-professions" },
        { key: "Purpose", value: "catalog-ingestion" },
      ],
    });
    Validations.of(ingestionRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RawDataBucket57F26C03.Arn>/raw/*]",
      reason:
        "S3 object writes require an object-key wildcard; this policy is limited to the retained raw-data bucket's raw/ prefix and grants no bucket-management actions.",
    });
    Validations.of(ingestionRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RawDataBucket57F26C03.Arn>/releases/data/*]",
      reason:
        "Data release audit and manifest object keys are content-qualified at runtime; this wildcard is limited to the retained raw-data bucket's releases/data/ prefix.",
    });

    const migrationRole = new iam.CfnRole(this, "MigrationRole", {
      description:
        "Short-lived administrative database access for reviewed schema migrations.",
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
          policyName: "ApplyDatabaseMigrations",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "dsql:DbConnectAdmin",
                Resource: dataCluster.attrResourceArn,
              },
            ],
          },
        },
      ],
      tags: [
        { key: "Project", value: "forever-professions" },
        { key: "Purpose", value: "database-migrations" },
      ],
    });

    new ssm.StringParameter(this, "DataClusterEndpointParameter", {
      parameterName: deployment.dataClusterEndpointParameterName,
      stringValue: dataCluster.attrEndpoint,
      description: "Aurora DSQL endpoint for Forever Professions application runtimes.",
    });
    new ssm.StringParameter(this, "DataClusterIdentifierParameter", {
      parameterName: deployment.dataClusterIdentifierParameterName,
      stringValue: dataCluster.ref,
      description: "Aurora DSQL cluster identifier for Forever Professions.",
    });

    const pricingWorkerLogGroup = new logs.LogGroup(this, "PricingWorkerLogGroup", {
      retention: deployment.logRetention,
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
    Validations.of(pricingWorker).acknowledge({
      id: "AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]",
      reason:
        "CDK attaches the standard Lambda basic execution policy for CloudWatch log delivery; application and database permissions remain separate and resource-scoped.",
    });
    Validations.of(pricingWorker).acknowledge({
      id: "AwsSolutions-IAM5[Resource::*]",
      reason:
        "Active X-Ray tracing requires xray:PutTraceSegments and xray:PutTelemetryRecords on Resource * because those write APIs do not support resource-level permissions.",
    });
    pricingWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dsql:DbConnect"],
        resources: [dataCluster.attrResourceArn],
      }),
    );

    const refreshDeadLetterQueue = new sqs.Queue(this, "PricingRefreshDeadLetterQueue", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.DESTROY,
    });
    Validations.of(refreshDeadLetterQueue).acknowledge({
      id: "AwsSolutions::AwsSolutions-SQS3",
      reason:
        "This queue is itself the EventBridge Scheduler dead-letter destination, so attaching another dead-letter queue would create an unnecessary recursive failure path.",
    });
    const scheduleName = deployment.auctionRefreshScheduleName;
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
    scheduleRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [pricingWorker.functionArn],
      }),
    );
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
          input: JSON.stringify({ source: deployment.auctionRefreshSource }),
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
    new CfnOutput(this, "MigrationRoleArn", {
      value: migrationRole.attrArn,
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
