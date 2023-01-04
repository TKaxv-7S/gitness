// Copyright 2022 Harness Inc. All rights reserved.
// Use of this source code is governed by the Polyform Free Trial License
// that can be found in the LICENSE.md file for this repository.

package enum

import "sort"

// WebhookParent defines different types of parents of a webhook.
type WebhookParent string

const (
	// WebhookParentSpace describes a repo as webhook owner.
	WebhookParentRepo WebhookParent = "repo"

	// WebhookParentSpace describes a space as webhook owner.
	WebhookParentSpace WebhookParent = "space"
)

func GetAllWebhookParents() []WebhookParent {
	return []WebhookParent{
		WebhookParentRepo,
		WebhookParentSpace,
	}
}

// WebhookExecutionResult defines the different results of a webhook execution.
type WebhookExecutionResult string

const (
	// WebhookExecutionResultSuccess describes a webhook execution result that succeeded.
	WebhookExecutionResultSuccess WebhookExecutionResult = "success"

	// WebhookExecutionResultRetriableError describes a webhook execution result that failed with a retriable error.
	WebhookExecutionResultRetriableError WebhookExecutionResult = "retriable_error"

	// WebhookExecutionResultFatalError describes a webhook execution result that failed with an unrecoverable error.
	WebhookExecutionResultFatalError WebhookExecutionResult = "fatal_error"
)

func GetAllWebhookExecutionResults() []WebhookExecutionResult {
	return []WebhookExecutionResult{
		WebhookExecutionResultSuccess,
		WebhookExecutionResultRetriableError,
		WebhookExecutionResultFatalError,
	}
}

// WebhookTrigger defines the different types of webhook triggers available.
// NOTE: For now we keep a small list - will be extended later on once we decided on a final set of triggers.
type WebhookTrigger string

const (
	// WebhookTriggerBranchPushed gets triggered when a branch gets pushed (created or updated).
	WebhookTriggerBranchPushed WebhookTrigger = "branch_pushed"
	// WebhookTriggerBranchDeleted gets triggered when a branch gets deleted.
	WebhookTriggerBranchDeleted WebhookTrigger = "branch_deleted"
)

func GetAllWebhookTriggers() []WebhookTrigger {
	return []WebhookTrigger{
		WebhookTriggerBranchPushed,
		WebhookTriggerBranchDeleted,
	}
}

var rawWebhookTriggers = enumToStringSlice(GetAllWebhookTriggers())

func init() {
	sort.Strings(rawWebhookTriggers)
}

// ParsePullReqActivityType parses the webhook trigger type.
func ParseWebhookTrigger(s string) (WebhookTrigger, bool) {
	if existsInSortedSlice(rawWebhookTriggers, s) {
		return WebhookTrigger(s), true
	}
	return "", false
}