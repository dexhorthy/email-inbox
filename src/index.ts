import { cliDumpEmails } from "./cli";

async function main() {
	await cliDumpEmails();
}

main().catch(console.error);
