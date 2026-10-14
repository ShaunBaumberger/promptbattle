import { Fragment, type ReactNode } from "react";

/**
 * Like `interpolate`, but placeholders may be React nodes (e.g. links), so
 * translators keep control of word order around them.
 */
export function richText(template: string, nodes: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in nodes ? nodes[key] : part}</Fragment>;
  });
}
