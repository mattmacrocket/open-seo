import { createFileRoute } from "@tanstack/react-router";
import { IndexationPage } from "@/client/features/indexation/IndexationPage";

export const Route = createFileRoute("/_project/p/$projectId/indexation")({
  component: IndexationRoute,
});

function IndexationRoute() {
  const { projectId } = Route.useParams();
  return <IndexationPage projectId={projectId} />;
}
