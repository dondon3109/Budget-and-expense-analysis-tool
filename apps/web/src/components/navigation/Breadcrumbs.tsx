import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./Breadcrumbs.css";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav className={`breadcrumbs ${className}`.trim()} aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="breadcrumb-item">
              {index > 0 && (
                <ChevronRight size={13} className="breadcrumb-separator" aria-hidden="true" />
              )}
              {isLast || !item.to ? (
                <span className="breadcrumb-current" aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="breadcrumb-link">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
