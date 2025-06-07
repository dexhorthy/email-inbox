import type { gmail_v1 } from "googleapis"
import { parseEmailBody } from "../emailParser"

// Exact payload from the failing email
const testPayload: gmail_v1.Schema$MessagePart = {
  partId: "0",
  mimeType: "multipart/related",
  filename: "",
  headers: [
    {
      name: "Content-Type",
      value: 'multipart/related; boundary="000000000000edc0e20636f55e06"',
    },
  ],
  body: {
    size: 0,
  },
  parts: [
    {
      partId: "0.0",
      mimeType: "multipart/alternative",
      filename: "",
      headers: [
        {
          name: "Content-Type",
          value:
            'multipart/alternative; boundary="000000000000edc0ea0636f55e07"',
        },
      ],
      body: {
        size: 0,
      },
      parts: [
        {
          partId: "0.0.0",
          mimeType: "text/plain",
          filename: "",
          headers: [
            {
              name: "Content-Type",
              value: 'text/plain; charset="UTF-8"',
            },
          ],
          body: {
            size: 240,
            data: "DQoqKiBBZGRyZXNzIG5vdCBmb3VuZCAqKg0KDQpZb3VyIG1lc3NhZ2Ugd2Fzbid0IGRlbGl2ZXJlZCB0byBwYXBlcmNsdWJAbWFpbC5haXRpbmtlcmVycy5vcmcgYmVjYXVzZSB0aGUgYWRkcmVzcyBjb3VsZG4ndCBiZSBmb3VuZCwgb3IgaXMgdW5hYmxlIHRvIHJlY2VpdmUgbWFpbC4NCg0KDQoNClRoZSByZXNwb25zZSBmcm9tIHRoZSByZW1vdGUgc2VydmVyIHdhczoNCjU1MCBNYWlsYm94IGRvZXMgbm90IGV4aXN0IQ0K",
          },
        },
        {
          partId: "0.0.1",
          mimeType: "text/html",
          filename: "",
          headers: [
            {
              name: "Content-Type",
              value: 'text/html; charset="UTF-8"',
            },
          ],
          body: {
            size: 1352,
            data: "DQo8aHRtbD4NCjxoZWFkPg0KPHN0eWxlPg0KKiB7DQpmb250LWZhbWlseTpSb2JvdG8sICJIZWx2ZXRpY2EgTmV1ZSIsIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWY7DQp9DQo8L3N0eWxlPg0KPC9oZWFkPg0KPGJvZHk-DQo8dGFibGUgY2VsbHBhZGRpbmc9IjAiIGNlbGxzcGFjaW5nPSIwIiBjbGFzcz0iZW1haWwtd3JhcHBlciIgc3R5bGU9InBhZGRpbmctdG9wOjMycHg7YmFja2dyb3VuZC1jb2xvcjojZmZmZmZmOyI-PHRib2R5Pg0KPHRyPjx0ZD4NCjx0YWJsZSBjZWxscGFkZGluZz0wIGNlbGxzcGFjaW5nPTA-PHRib2R5Pg0KPHRyPjx0ZCBzdHlsZT0ibWF4LXdpZHRoOjU2MHB4O3BhZGRpbmc6MjRweCAyNHB4IDMycHg7YmFja2dyb3VuZC1jb2xvcjojZmFmYWZhO2JvcmRlcjoxcHggc29saWQgI2UwZTBlMDtib3JkZXItcmFkaXVzOjJweCI-DQo8aW1nIHN0eWxlPSJwYWRkaW5nOjAgMjRweCAxNnB4IDA7ZmxvYXQ6bGVmdCIgd2lkdGg9NzIgaGVpZ2h0PTcyIGFsdD0iRXJyb3IgSWNvbiIgc3JjPSJjaWQ6aWNvbi5wbmciPg0KPHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6MjcycHg7cGFkZGluZy10b3A6OHB4Ij48dGJvZHk-DQo8dHI-PHRkPjxoMiBzdHlsZT0iZm9udC1zaXplOjIwcHg7Y29sb3I6IzIxMjEyMTtmb250LXdlaWdodDpib2xkO21hcmdpbjowIj4NCkFkZHJlc3Mgbm90IGZvdW5kDQo8L2gyPjwvdGQ-PC90cj4NCjx0cj48dGQgc3R5bGU9InBhZGRpbmctdG9wOjIwcHg7Y29sb3I6Izc1NzU3NTtmb250LXNpemU6MTZweDtmb250LXdlaWdodDpub3JtYWw7dGV4dC1hbGlnbjpsZWZ0Ij4NCllvdXIgbWVzc2FnZSB3YXNuJ3QgZGVsaXZlcmVkIHRvIDxhIHN0eWxlPSdjb2xvcjojMjEyMTIxO3RleHQtZGVjb3JhdGlvbjpub25lJz48Yj5wYXBlcmNsdWJAbWFpbC5haXRpbmtlcmVycy5vcmc8L2I-PC9hPiBiZWNhdXNlIHRoZSBhZGRyZXNzIGNvdWxkbid0IGJlIGZvdW5kLCBvciBpcyB1bmFibGUgdG8gcmVjZWl2ZSBtYWlsLg0KPC90ZD48L3RyPg0KPC90Ym9keT48L3RhYmxlPg0KPC90ZD48L3RyPg0KPC90Ym9keT48L3RhYmxlPg0KPC90ZD48L3RyPg0KPHRyIHN0eWxlPSJib3JkZXI6bm9uZTtiYWNrZ3JvdW5kLWNvbG9yOiNmZmY7Zm9udC1zaXplOjEyLjhweDt3aWR0aDo5MCUiPg0KPHRkIGFsaWduPSJsZWZ0IiBzdHlsZT0icGFkZGluZzo0OHB4IDEwcHgiPg0KVGhlIHJlc3BvbnNlIGZyb20gdGhlIHJlbW90ZSBzZXJ2ZXIgd2FzOjxici8-DQo8cCBzdHlsZT0iZm9udC1mYW1pbHk6bW9ub3NwYWNlIj4NCjU1MCBNYWlsYm94IGRvZXMgbm90IGV4aXN0IQ0KPC9wPg0KPC90ZD4NCjwvdHI-DQo8L3Rib2R5PjwvdGFibGU-DQo8L2JvZHk-DQo8L2h0bWw-DQo=",
          },
        },
      ],
    },
    {
      partId: "0.1",
      mimeType: "image/png",
      filename: "icon.png",
      headers: [
        {
          name: "Content-Type",
          value: 'image/png; name="icon.png"',
        },
        {
          name: "Content-Disposition",
          value: 'attachment; filename="icon.png"',
        },
        {
          name: "Content-Transfer-Encoding",
          value: "base64",
        },
        {
          name: "Content-ID",
          value: "<icon.png>",
        },
      ],
      body: {
        attachmentId:
          "ANGjdJ9D5x8nRzF8mq7fF7_4ehqpwEItsmfsT8tOP-Mys9xdSpxUc3ioOP_PBBAcc4V5z_z_gReDZ-e4eh3EJ-Vj8L50u8AfMgePHRfObG9YMgVqYX94TjTsNzQpdzBTglIBbX1soB-u7WhZvRn5I9sCdIwIYxHy40Cr5QqUnOQ1q4jUZXpHQyscVVGGiKyY5Tf4yxSHM2vgzj5sYTqaCdE1frhLvORjhBiF7nk1Ue13srzKermOvSSSZ7S4bLyDrdf9gebe3PgX8hN6MunWIk6HPaP_2DMxCZMCGeDS-3rehAXgfMgFs6l8HGltIBWoB11aEfAKq56f1nS2IZDykK3qzuCpUMjPMrXRp21vhuY8rTtsM4sc2fTSDliugtGKnon67SdvMhkleXslgbHZ",
        size: 1450,
      },
    },
  ],
}

console.log("Testing parseEmailBody with exact failing data...")

const result = parseEmailBody(testPayload)

console.log("Result:", result)
console.log("Text length:", result.text.length)
console.log("HTML length:", result.html.length)

if (result.text.length > 0) {
  console.log("✅ Text parsed successfully!")
  console.log("Text content:", result.text.substring(0, 100))
} else {
  console.log("❌ Text parsing failed!")
}

if (result.html.length > 0) {
  console.log("✅ HTML parsed successfully!")
  console.log("HTML content:", result.html.substring(0, 100))
} else {
  console.log("❌ HTML parsing failed!")
}

// Let's also manually decode the base64 to see what we should expect
const expectedText = Buffer.from(
  "DQoqKiBBZGRyZXNzIG5vdCBmb3VuZCAqKg0KDQpZb3VyIG1lc3NhZ2Ugd2Fzbid0IGRlbGl2ZXJlZCB0byBwYXBlcmNsdWJAbWFpbC5haXRpbmtlcmVycy5vcmcgYmVjYXVzZSB0aGUgYWRkcmVzcyBjb3VsZG4ndCBiZSBmb3VuZCwgb3IgaXMgdW5hYmxlIHRvIHJlY2VpdmUgbWFpbC4NCg0KDQoNClRoZSByZXNwb25zZSBmcm9tIHRoZSByZW1vdGUgc2VydmVyIHdhczoNCjU1MCBNYWlsYm94IGRvZXMgbm90IGV4aXN0IQ0K",
  "base64",
).toString()

console.log("Expected text content:", expectedText)
console.log("Expected text length:", expectedText.length)
