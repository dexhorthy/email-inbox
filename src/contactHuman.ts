import { HumanLayer } from "@humanlayer/sdk"

const humanLayer = new HumanLayer()

export async function contactHuman(message: string): Promise<string> {
  const response = await humanLayer.fetchHumanResponse({
    spec: {
      msg: message,
    },
  })
  return response
}

export async function getDraftFeedback(data: {
  summary: string
  body: string
  from: string
  subject: string
}): Promise<boolean> {
  const response = await humanLayer.fetchHumanApproval({
    spec: {
      fn: "DraftReplyClassifierResult",
      kwargs: {
        from: data.from,
        subject: data.subject,
        summary: data.summary,
        body: data.body,
      },
    },
  })
  return response.approved ?? false
}
