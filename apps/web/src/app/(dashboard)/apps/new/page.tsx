import { NewAppWizard } from "@/components/apps/new-app-wizard";
import { listInstallations } from "@/actions/github";

export default async function NewAppPage() {
  const installations = await listInstallations();
  return <NewAppWizard installations={installations} />;
}
