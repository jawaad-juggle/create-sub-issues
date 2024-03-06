import * as core from '@actions/core'
import * as github from '@actions/github'
import { Context } from '@actions/github/lib/context'
import { Octokit } from '@octokit/core'
import { PaginateInterface } from '@octokit/plugin-paginate-rest'
import { Api } from '@octokit/plugin-rest-endpoint-methods/dist-types/types'

/**
 * Get the list of the sub actions for the main issue
 * @returns {Promise<string[]>} The list of sub actions.
 */
export async function getSubActions(): Promise<string[]> {
  const issueBody: string | undefined = github.context.payload.issue!.body

  if (issueBody?.length === 0) {
    core.error('No tasks found in issue body')
    core.ExitCode.Success
  }

  // Define the regex pattern to match unchecked tasks
  const regexPattern = /- \[ \] (.+)/g

  // Extract the unchecked tasks from the issue body
  const uncheckedTasks: string[] = []
  let match
  while ((match = regexPattern.exec(issueBody!)) !== null) {
    uncheckedTasks.push(match[1])
  }

  // Log the unchecked tasks
  console.log(uncheckedTasks)
  core.debug(`Unchecked tasks: ${uncheckedTasks}`)

  return uncheckedTasks
}

/**
 * Update the issue body by removing the current task list and adding a new task list with the names and URLs of the new issues.
 * @param context the context of the action.
 * @param newIssues The array of new issues.
 * @param client The Octokit client.
 * @returns {Boolean} whether the issue body was updated successfully.
 */
async function updateIssueBody(
  newIssues: any[],
  context: Context,
  client: Octokit &
    Api & {
      paginate: PaginateInterface
    }
): Promise<boolean> {
  const currentIssueBody = context.payload.issue?.body!

  // Remove the current task list
  const regexPattern = /- \[ \] .+\n/g
  const updatedBody = currentIssueBody.replace(regexPattern, '')

  // Add a new task list with the names and URLs of the new issues
  const newTaskList = newIssues
    .map((issue: any) => `- [ ] [${issue.title}](${issue.html_url})`)
    .join('\n')
  const finalBody = `${updatedBody}\n\n${newTaskList}`

  // Update the issue body
  await client.rest.issues.update({
    owner: context.payload.repo.owner,
    repo: context.payload.repo.repo,
    issue_number: context.payload.issue!.number,
    body: finalBody
  })

  return true
}
/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get the list of sub actions to create issues for
    const subtasks = await getSubActions()

    if (subtasks.length === 0) {
      core.info('No subtasks found to create issues for')
      core.ExitCode.Success
    }

    // create octokit client
    const ghToken: string = core.getInput('github_token')
    const ghClient = github.getOctokit(ghToken)

    // Create an issue for each sub action
    const newIssues = await Promise.all(
      subtasks.map(async (subtask: string) => {
        const issue = ghClient.rest.issues.create({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          title: subtask,
          body: `This issue was created from the main issue: #${github.context.issue.number}`
        })
        return issue
      })
    )

    // Update the issue body with the new task list
    const updatedBody = await updateIssueBody(
      newIssues,
      github.context,
      ghClient
    )

    core.setOutput('new_issues', newIssues)
    core.ExitCode.Success
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
