import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore
from google.auth.transport.requests import Request
from googleapiclient.discovery import build, Resource  # type: ignore


GMAIL_CREDS_PATH = "gmail_creds.json"

def email():
    SCOPES = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.modify",
    ]
    creds = None
    token_path = os.path.join(os.path.dirname(str(GMAIL_CREDS_PATH)), "gmail_token.json")

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    # If no valid credentials, authenticate via OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(GMAIL_CREDS_PATH, SCOPES)
            creds = flow.run_local_server(port=8022, access_type="offline", prompt="consent")

        # Save credentials for future use
        with open(token_path, "w") as token:
            token.write(creds.to_json())

    service = build("gmail", "v1", credentials=creds)
    results = service.users().messages().list(userId="me", maxResults=1).execute()
    assert len(results.get("messages")), "No messages found; is your inbox completely empty?"
    message = service.users().messages().get(userId="me", id=results["messages"][0]["id"]).execute()
    print("Message snippet:", message["snippet"])

    # Print full message details including headers
    headers = message["payload"]["headers"]
    for header in headers:
        if header["name"] in ["From", "Subject", "Date"]:
            print(f"{header['name']}: {header['value']}")

if __name__ == "__main__":
    email()