import { EmptyState,PageHeader } from "@/components/ui";
export function FoundationPage({title,description,emptyTitle,emptyDescription}:{title:string;description:string;emptyTitle:string;emptyDescription:string}){return <><PageHeader title={title} description={description}/><EmptyState title={emptyTitle} description={emptyDescription}/></>}
