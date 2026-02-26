import type { WingmanContext } from "../../../../packages/shared/src/types";

type Props = {
	context: WingmanContext | null;
	isLoading?: boolean;
};

function basename(filePath: string): string {
	const parts = filePath.split(/[\\/]/);
	return parts[parts.length - 1] || filePath;
}

export function ContextHeader({ context, isLoading }: Props) {
	if (isLoading) {
		return (
			<div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-zinc-300">
				Loading context...
			</div>
		);
	}

	if (!context?.file || context.line === null) {
		return (
			<div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-zinc-300">
				No file context
			</div>
		);
	}

	return (
		<div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-emerald-100">
						{basename(context.file)}
					</p>
					<p className="truncate text-xs text-emerald-200/70">{context.file}</p>
				</div>
				<span className="shrink-0 rounded-full border border-emerald-200/20 bg-black/20 px-2 py-1 text-xs text-emerald-100">
					Line {context.line}
				</span>
			</div>
		</div>
	);
}
