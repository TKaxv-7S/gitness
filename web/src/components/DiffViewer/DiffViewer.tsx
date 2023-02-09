import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutate } from 'restful-react'
import ReactDOM from 'react-dom'
import { useInView } from 'react-intersection-observer'
import {
  Button,
  Color,
  Container,
  FlexExpander,
  ButtonVariation,
  Layout,
  Text,
  ButtonSize,
  useToaster
} from '@harness/uicore'
import cx from 'classnames'
import { Render } from 'react-jsx-match'
import { Diff2HtmlUI } from 'diff2html/lib-esm/ui/js/diff2html-ui'
import { useStrings } from 'framework/strings'
import { CodeIcon, GitInfoProps } from 'utils/GitUtils'
import { useEventListener } from 'hooks/useEventListener'
import type { DiffFileEntry } from 'utils/types'
import { useConfirmAct } from 'hooks/useConfirmAction'
import { PipeSeparator } from 'components/PipeSeparator/PipeSeparator'
import { useAppContext } from 'AppContext'
import type { TypesPullReq, TypesPullReqActivity } from 'services/code'
import { getErrorMessage } from 'utils/Utils'
import {
  activitiesToDiffCommentItems,
  activityToCommentItem,
  CommentType,
  DIFF2HTML_CONFIG,
  DiffCommentItem,
  DIFF_VIEWER_HEADER_HEIGHT,
  getCommentLineInfo,
  getDiffHTMLSnapshotFromRow,
  getRawTextInRange,
  PR_CODE_COMMENT_PAYLOAD_VERSION,
  PullRequestCodeCommentPayload,
  renderCommentOppositePlaceHolder,
  ViewStyle
} from './DiffViewerUtils'
import { CommentAction, CommentBox, CommentItem } from '../CommentBox/CommentBox'
import css from './DiffViewer.module.scss'

interface DiffViewerProps extends Pick<GitInfoProps, 'repoMetadata'> {
  diff: DiffFileEntry
  viewStyle: ViewStyle
  stickyTopPosition?: number
  readOnly?: boolean
  pullRequestMetadata?: TypesPullReq
  onCommentUpdate: () => void
}

//
// Note: Lots of direct DOM manipulations are used to boost performance.
//       Avoid React re-rendering at all cost as it might cause unresponsive UI
//       when diff content is big, or when a PR has a lot of changed files.
//
export const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  viewStyle,
  stickyTopPosition = 0,
  readOnly,
  repoMetadata,
  pullRequestMetadata,
  onCommentUpdate
}) => {
  const { getString } = useStrings()
  const [viewed, setViewed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [fileUnchanged] = useState(diff.unchangedPercentage === 100)
  const [fileDeleted] = useState(diff.isDeleted)
  const [renderCustomContent, setRenderCustomContent] = useState(fileUnchanged || fileDeleted)
  const [heightWithoutComments, setHeightWithoutComents] = useState<number | string>('auto')
  const [diffRenderer, setDiffRenderer] = useState<Diff2HtmlUI>()
  const { ref: inViewRef, inView } = useInView({ rootMargin: '100px 0px' })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { currentUser } = useAppContext()
  const { showError } = useToaster()
  const confirmAct = useConfirmAct()
  const path = useMemo(
    () => `/api/v1/repos/${repoMetadata.path}/+/pullreq/${pullRequestMetadata?.number}/comments`,
    [repoMetadata.path, pullRequestMetadata?.number]
  )
  const { mutate: saveComment } = useMutate({ verb: 'POST', path })
  const { mutate: updateComment } = useMutate({ verb: 'PATCH', path: ({ id }) => `${path}/${id}` })
  const { mutate: deleteComment } = useMutate({ verb: 'DELETE', path: ({ id }) => `${path}/${id}` })
  const [comments, setComments] = useState<DiffCommentItem<TypesPullReqActivity>[]>(activitiesToDiffCommentItems(diff))
  const commentsRef = useRef<DiffCommentItem<TypesPullReqActivity>[]>(comments)
  const setContainerRef = useCallback(
    node => {
      containerRef.current = node
      inViewRef(node)
    },
    [inViewRef]
  )
  const contentRef = useRef<HTMLDivElement>(null)
  const setupViewerInitialStates = useCallback(() => {
    setDiffRenderer(
      new Diff2HtmlUI(
        document.getElementById(diff.contentId) as HTMLElement,
        [diff],
        Object.assign({}, DIFF2HTML_CONFIG, { outputFormat: viewStyle })
      )
    )
  }, [diff, viewStyle])
  const renderDiffAndUpdateContainerHeightIfNeeded = useCallback(
    (enforced = false) => {
      const contentDOM = contentRef.current as HTMLDivElement
      const containerDOM = containerRef.current as HTMLDivElement

      if (!contentDOM.dataset.rendered || enforced) {
        if (!renderCustomContent || enforced) {
          containerDOM.style.height = 'auto'
          diffRenderer?.draw()
        }
        contentDOM.dataset.rendered = 'true'
        setHeightWithoutComents(containerDOM.clientHeight)
      }
    },
    [diffRenderer, renderCustomContent]
  )

  useEffect(
    function createDiffRenderer() {
      if (inView && !diffRenderer) {
        setupViewerInitialStates()
      }
    },
    [inView, diffRenderer, setupViewerInitialStates]
  )

  useEffect(
    function renderInitialContent() {
      if (diffRenderer && inView) {
        renderDiffAndUpdateContainerHeightIfNeeded()
      }
    },
    [inView, diffRenderer, renderDiffAndUpdateContainerHeightIfNeeded]
  )

  useEffect(
    function handleCollapsedState() {
      const containerDOM = containerRef.current as HTMLDivElement & { scrollIntoViewIfNeeded: () => void }
      const { classList: containerClassList, style: containerStyle } = containerDOM

      if (collapsed) {
        containerClassList.add(css.collapsed)

        // Fix scrolling position messes up with sticky header: When content of the diff content
        // is above the diff header, we need to scroll it back to below the header, adjust window
        // scrolling position to avoid the next diff scroll jump
        const { y } = containerDOM.getBoundingClientRect()
        if (y - stickyTopPosition < 1) {
          containerDOM.scrollIntoView()

          if (stickyTopPosition) {
            window.scroll({ top: window.scrollY - stickyTopPosition })
          }
        }

        if (parseInt(containerStyle.height) != DIFF_VIEWER_HEADER_HEIGHT) {
          containerStyle.height = `${DIFF_VIEWER_HEADER_HEIGHT}px`
        }
      } else {
        containerClassList.remove(css.collapsed)

        const commentsHeight = comments.reduce((total, comment) => total + comment.height, 0) || 0
        const newHeight = Number(heightWithoutComments) + commentsHeight

        if (parseInt(containerStyle.height) != newHeight) {
          containerStyle.height = `${newHeight}px`
        }
      }
    },
    [collapsed, heightWithoutComments, stickyTopPosition, comments]
  )

  useEventListener(
    'click',
    useCallback(
      function clickToAddAnnotation(event: MouseEvent) {
        if (readOnly) {
          return
        }

        const target = event.target as HTMLDivElement
        const targetButton = target?.closest('[data-annotation-for-line]') as HTMLDivElement
        const annotatedLineRow = targetButton?.closest('tr') as HTMLTableRowElement

        const commentItem: DiffCommentItem<TypesPullReqActivity> = {
          left: false,
          right: false,
          lineNumber: 0,
          height: 0,
          commentItems: []
        }

        if (targetButton && annotatedLineRow) {
          if (viewStyle === ViewStyle.SIDE_BY_SIDE) {
            const leftParent = targetButton.closest('.d2h-file-side-diff.left')
            commentItem.left = !!leftParent
            commentItem.right = !leftParent
            commentItem.lineNumber = Number(targetButton.dataset.annotationForLine)
          } else {
            const lineInfoTD = targetButton.closest('td')?.previousElementSibling
            const lineNum1 = lineInfoTD?.querySelector('.line-num1')
            const lineNum2 = lineInfoTD?.querySelector('.line-num2')

            // Right has priority
            commentItem.right = !!lineNum2?.textContent
            commentItem.left = !commentItem.right
            commentItem.lineNumber = Number(lineNum2?.textContent || lineNum1?.textContent)
          }

          setComments([...comments, commentItem])
        }
      },
      [viewStyle, comments, readOnly]
    ),
    containerRef.current as HTMLDivElement
  )

  useEffect(
    function renderAnnotatations() {
      if (readOnly) {
        return
      }

      const isSideBySide = viewStyle === ViewStyle.SIDE_BY_SIDE

      // Update latest commentsRef to use it inside CommentBox callbacks
      commentsRef.current = comments

      comments.forEach(comment => {
        const lineInfo = getCommentLineInfo(contentRef.current, comment, viewStyle)

        if (lineInfo.rowElement) {
          const { rowElement } = lineInfo

          if (lineInfo.hasCommentsRendered) {
            if (isSideBySide) {
              const filesDiff = rowElement?.closest('.d2h-files-diff') as HTMLElement
              const sideDiff = filesDiff?.querySelector(`div.${comment.left ? 'right' : 'left'}`) as HTMLElement
              const oppositeRowPlaceHolder = sideDiff?.querySelector(
                `tr[data-place-holder-for-line="${comment.lineNumber}"]`
              )

              const first = oppositeRowPlaceHolder?.firstElementChild as HTMLTableCellElement
              const last = oppositeRowPlaceHolder?.lastElementChild as HTMLTableCellElement

              if (first && last) {
                first.style.height = `${comment.height}px`
                last.style.height = `${comment.height}px`
              }
            }
          } else {
            // Mark row that it has comment/annotation
            rowElement.dataset.annotated = 'true'

            // Create a new row below it and render CommentBox inside
            const commentRowElement = document.createElement('tr')
            commentRowElement.dataset.annotatedLine = String(comment.lineNumber)
            commentRowElement.innerHTML = `<td colspan="2"></td>`
            rowElement.after(commentRowElement)

            const element = commentRowElement.firstElementChild as HTMLTableCellElement

            // Note: CommentBox is rendered as an independent React component
            //       everything passed to it must be either values, or refs. If you
            //       pass callbacks or states, they won't be updated and might
            // .     cause unexpected bugs
            ReactDOM.unmountComponentAtNode(element as HTMLDivElement)
            ReactDOM.render(
              <CommentBox
                commentItems={comment.commentItems}
                initialContent={getInitialCommentContentFromSelection(diff)}
                getString={getString}
                width={isSideBySide ? 'calc(100vw / 2 - 163px)' : undefined} // TODO: Re-calcualte for standalone version
                onHeightChange={boxHeight => {
                  if (comment.height !== boxHeight) {
                    comment.height = boxHeight
                    setTimeout(() => setComments([...commentsRef.current]), 0)
                  }
                }}
                onCancel={() => {
                  // Clean up CommentBox rendering and reset states bound to lineInfo
                  ReactDOM.unmountComponentAtNode(element as HTMLDivElement)
                  commentRowElement.parentElement?.removeChild(commentRowElement)
                  lineInfo.oppositeRowElement?.parentElement?.removeChild(
                    lineInfo.oppositeRowElement?.nextElementSibling as Element
                  )
                  delete lineInfo.rowElement.dataset.annotated
                  setTimeout(() => setComments(commentsRef.current.filter(item => item !== comment)), 0)
                }}
                currentUserName={currentUser.display_name}
                handleAction={async (action, value, commentItem) => {
                  let result = true
                  let updatedItem: CommentItem<TypesPullReqActivity> | undefined = undefined
                  const id = (commentItem as CommentItem<TypesPullReqActivity>)?.payload?.id

                  switch (action) {
                    case CommentAction.NEW: {
                      // lineNumberRange can be used to allow multiple-line selection when commenting in the future
                      const lineNumberRange = [comment.lineNumber]
                      const payload: PullRequestCodeCommentPayload = {
                        type: CommentType.CODE_COMMENT,
                        version: PR_CODE_COMMENT_PAYLOAD_VERSION,
                        file_id: diff.fileId,
                        file_title: diff.fileTitle,
                        language: diff.language || '',
                        is_on_left: comment.left,
                        at_line_number: comment.lineNumber,
                        line_number_range: lineNumberRange,
                        range_text_content: getRawTextInRange(diff, lineNumberRange),
                        diff_html_snapshot: getDiffHTMLSnapshotFromRow(rowElement)
                      }

                      await saveComment({ type: CommentType.CODE_COMMENT, text: value, payload })
                        .then((newComment: TypesPullReqActivity) => {
                          updatedItem = activityToCommentItem(newComment)
                        })
                        .catch(exception => {
                          result = false
                          showError(getErrorMessage(exception), 0)
                        })
                      break
                    }

                    case CommentAction.REPLY: {
                      const parentComment = diff.fileActivities?.find(
                        activity => (activity.payload as PullRequestCodeCommentPayload).file_id === diff.fileId
                      )

                      if (parentComment) {
                        await saveComment({
                          type: CommentType.CODE_COMMENT,
                          text: value,
                          parent_id: Number(parentComment.id as number)
                        })
                          .then(newComment => {
                            updatedItem = activityToCommentItem(newComment)
                          })
                          .catch(exception => {
                            result = false
                            showError(getErrorMessage(exception), 0)
                          })
                      }
                      break
                    }

                    case CommentAction.DELETE: {
                      result = false
                      await confirmAct({
                        message: getString('deleteCommentConfirm'),
                        action: async () => {
                          await deleteComment({}, { pathParams: { id } })
                            .then(() => {
                              result = true
                            })
                            .catch(exception => {
                              result = false
                              showError(getErrorMessage(exception), 0, getString('pr.failedToDeleteComment'))
                            })
                        }
                      })
                      break
                    }

                    case CommentAction.UPDATE: {
                      await updateComment({ text: value }, { pathParams: { id } })
                        .then(newComment => {
                          updatedItem = activityToCommentItem(newComment)
                        })
                        .catch(exception => {
                          result = false
                          showError(getErrorMessage(exception), 0)
                        })
                      break
                    }
                  }

                  if (result) {
                    onCommentUpdate()
                  }

                  return [result, updatedItem]
                }}
              />,
              element
            )

            // Split view: Calculate, inject, and adjust an empty place-holder row in the opposite pane
            if (isSideBySide && lineInfo.oppositeRowElement) {
              renderCommentOppositePlaceHolder(comment, lineInfo.oppositeRowElement)
            }
          }
        }
        // Comment no longer has UI relevant anchors to be rendered
        // else {
        //   console.info('Comment is discarded due to no UI relevant anchors', { comment, lineInfo })
        // }
      })
    },
    [
      comments,
      viewStyle,
      getString,
      currentUser,
      readOnly,
      diff,
      saveComment,
      showError,
      updateComment,
      deleteComment,
      confirmAct,
      onCommentUpdate
    ]
  )

  useEffect(function cleanUpCommentBoxRendering() {
    const contentDOM = contentRef.current
    return () => {
      contentDOM
        ?.querySelectorAll('[data-annotated-line]')
        .forEach(element => ReactDOM.unmountComponentAtNode(element.firstElementChild as HTMLTableCellElement))
    }
  }, [])

  return (
    <Container
      ref={setContainerRef}
      id={diff.containerId}
      className={cx(css.main, { [css.readOnly]: readOnly })}
      style={{ '--diff-viewer-sticky-top': `${stickyTopPosition}px` } as React.CSSProperties}>
      <Layout.Vertical>
        <Container className={css.diffHeader} height={DIFF_VIEWER_HEADER_HEIGHT}>
          <Layout.Horizontal>
            <Button
              variation={ButtonVariation.ICON}
              icon={collapsed ? 'chevron-right' : 'chevron-down'}
              size={ButtonSize.SMALL}
              onClick={() => setCollapsed(!collapsed)}
            />
            <Container style={{ alignSelf: 'center' }} padding={{ right: 'small' }}>
              <Layout.Horizontal spacing="xsmall">
                <Render when={diff.addedLines}>
                  <Text color={Color.GREEN_600} style={{ fontSize: '12px' }}>
                    +{diff.addedLines}
                  </Text>
                </Render>
                <Render when={diff.addedLines && diff.deletedLines}>
                  <PipeSeparator height={8} />
                </Render>
                <Render when={diff.deletedLines}>
                  <Text color={Color.RED_500} style={{ fontSize: '12px' }}>
                    -{diff.deletedLines}
                  </Text>
                </Render>
              </Layout.Horizontal>
            </Container>
            <Text inline className={css.fname}>
              {diff.fileTitle}
            </Text>
            <Button variation={ButtonVariation.ICON} icon={CodeIcon.Copy} size={ButtonSize.SMALL} />
            <FlexExpander />

            <Render when={!readOnly}>
              <Container>
                <label className={css.viewLabel}>
                  <input
                    type="checkbox"
                    value="viewed"
                    checked={viewed}
                    onChange={() => {
                      setViewed(!viewed)
                      setCollapsed(!viewed)
                    }}
                  />
                  {getString('viewed')}
                </label>
              </Container>
            </Render>
          </Layout.Horizontal>
        </Container>

        <Container id={diff.contentId} className={css.diffContent} ref={contentRef}>
          <Render when={renderCustomContent}>
            <Container>
              <Layout.Vertical padding="xlarge" style={{ alignItems: 'center' }}>
                <Render when={fileDeleted}>
                  <Button
                    variation={ButtonVariation.LINK}
                    onClick={() => {
                      setRenderCustomContent(false)
                      setTimeout(() => renderDiffAndUpdateContainerHeightIfNeeded(true), 0)
                    }}>
                    {getString('pr.showDiff')}
                  </Button>
                </Render>
                <Text>{getString(fileDeleted ? 'pr.fileDeleted' : 'pr.fileUnchanged')}</Text>
              </Layout.Vertical>
            </Container>
          </Render>
        </Container>
      </Layout.Vertical>
    </Container>
  )
}

function getInitialCommentContentFromSelection(_diff: DiffFileEntry) {
  return ''
}