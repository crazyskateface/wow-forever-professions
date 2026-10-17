#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  DELIVERY_STAGES,
  GITHUB_OWNER,
  GITHUB_OWNER_ID,
  GITHUB_REPOSITORY,
  GITHUB_REPOSITORY_NAME,
} from "../lib/delivery-config";
import { DEPLOYMENT_ACCOUNT_ID, DEPLOYMENT_REGION } from "../lib/deployment-config";

const enableBranchProtection = process.argv.includes(
  "--enable-branch-protection",
);
const apiVersion = "2022-11-28";

function gh(args: string[], input?: unknown): string {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    input: input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  });
  if (result.status !== 0) {
    throw new Error(
      [result.stderr, result.stdout].filter(Boolean).join("\n").trim(),
    );
  }
  return result.stdout.trim();
}

function api(
  method: "DELETE" | "GET" | "POST" | "PUT",
  path: string,
  input?: unknown,
): string {
  const args = [
    "api",
    "--method",
    method,
    "-H",
    `X-GitHub-Api-Version: ${apiVersion}`,
    path,
  ];
  if (input !== undefined) {
    args.push("--input", "-");
  }
  return gh(args, input);
}

function ensureExclusiveBranchPolicy(environment: string, branch: string): void {
  const path =
    `repos/${GITHUB_REPOSITORY}/environments/${environment}` +
    "/deployment-branch-policies";
  const current = JSON.parse(api("GET", path)) as {
    branch_policies?: Array<{ id: number; name: string; type?: string }>;
  };
  for (const policy of current.branch_policies ?? []) {
    if (policy.name !== branch || policy.type === "tag") {
      api("DELETE", `${path}/${policy.id}`);
    }
  }
  if (
    current.branch_policies?.some(
      (policy) => policy.name === branch && policy.type !== "tag",
    )
  ) {
    return;
  }
  api("POST", path, { name: branch, type: "branch" });
}

function protectBranch(branch: string): void {
  const checkRuns = JSON.parse(
    api("GET", `repos/${GITHUB_REPOSITORY}/commits/${branch}/check-runs`),
  ) as {
    check_runs?: Array<{
      app?: { id?: number };
      conclusion?: string | null;
      name?: string;
    }>;
  };
  const validationCheck = checkRuns.check_runs?.find(
    (check) => check.name === "Verify repository",
  );
  if (
    validationCheck?.app?.id === undefined ||
    validationCheck.conclusion !== "success"
  ) {
    throw new Error(
      `Verify repository must complete successfully on ${branch} before branch protection can be enabled.`,
    );
  }

  api(
    "PUT",
    `repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY_NAME}/branches/${branch}/protection`,
    {
      required_status_checks: {
        strict: true,
        checks: [
          {
            context: "Verify repository",
            app_id: validationCheck.app.id,
          },
        ],
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        required_approving_review_count: 0,
        require_last_push_approval: false,
      },
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
      lock_branch: false,
      allow_fork_syncing: true,
    },
  );
}

gh(["auth", "status"]);

for (const delivery of DELIVERY_STAGES) {
  const isProduction = delivery.stage === "production";
  api("PUT", `repos/${GITHUB_REPOSITORY}/environments/${delivery.stage}`, {
    wait_timer: 0,
    can_admins_bypass: false,
    prevent_self_review: false,
    reviewers: isProduction
      ? [{ type: "User", id: Number(GITHUB_OWNER_ID) }]
      : [],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  });
  ensureExclusiveBranchPolicy(delivery.stage, delivery.branch);

  for (const [name, value] of Object.entries({
    AWS_ACCOUNT_ID: DEPLOYMENT_ACCOUNT_ID,
    AWS_REGION: DEPLOYMENT_REGION,
    AWS_DEPLOY_ROLE_ARN: delivery.roleArn,
  })) {
    gh([
      "variable",
      "set",
      name,
      "--repo",
      GITHUB_REPOSITORY,
      "--env",
      delivery.stage,
      "--body",
      value,
    ]);
  }
}

if (enableBranchProtection) {
  for (const branch of ["stage", "main"]) protectBranch(branch);
} else {
  console.log(
    "GitHub environments and variables configured. Re-run with --enable-branch-protection after the validation workflow is on GitHub.",
  );
}
