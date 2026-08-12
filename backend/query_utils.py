"""
Query optimization utilities to prevent N+1 problems and improve performance.
"""
from typing import List, Dict, Any, Optional, TypeVar, Generic
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

T = TypeVar('T')


class PaginatedResult(Generic[T]):
    """Container for paginated query results."""
    
    def __init__(
        self,
        items: List[T],
        total: int,
        page: int,
        per_page: int,
    ):
        self.items = items
        self.total = total
        self.page = page
        self.per_page = per_page
        self.total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
        self.has_next = page < self.total_pages
        self.has_prev = page > 1
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "items": self.items,
            "total": self.total,
            "page": self.page,
            "per_page": self.per_page,
            "total_pages": self.total_pages,
            "has_next": self.has_next,
            "has_prev": self.has_prev,
        }


async def paginate(
    db: AsyncSession,
    query,
    page: int = 1,
    per_page: int = 20,
    max_per_page: int = 100,
) -> PaginatedResult:
    """
    Apply pagination to a query.
    
    Args:
        db: Database session
        query: SQLAlchemy query
        page: Page number (1-indexed)
        per_page: Items per page
        max_per_page: Maximum allowed items per page
    
    Returns:
        PaginatedResult with items and pagination metadata
    """
    page = max(1, page)
    per_page = min(max(1, per_page), max_per_page)
    
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    
    offset = (page - 1) * per_page
    paginated_query = query.offset(offset).limit(per_page)
    
    result = await db.execute(paginated_query)
    items = result.scalars().all()
    
    return PaginatedResult(
        items=list(items),
        total=total,
        page=page,
        per_page=per_page,
    )


async def bulk_fetch_related(
    db: AsyncSession,
    model,
    ids: List[str],
    relationship_name: str,
) -> Dict[str, List]:
    """
    Efficiently fetch related objects for multiple parent objects.
    
    Args:
        db: Database session
        model: Parent model class
        ids: List of parent IDs
        relationship_name: Name of the relationship to fetch
    
    Returns:
        Dict mapping parent ID to list of related objects
    """
    if not ids:
        return {}
    
    query = select(model).where(
        model.id.in_(ids)
    ).options(selectinload(getattr(model, relationship_name)))
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return {
        item.id: getattr(item, relationship_name, [])
        for item in items
    }


async def count_by_status(
    db: AsyncSession,
    model,
    status_column,
    filter_column=None,
    filter_value=None,
) -> Dict[str, int]:
    """
    Get counts grouped by status efficiently.
    
    Args:
        db: Database session
        model: Model class
        status_column: Column to group by
        filter_column: Optional column to filter on
        filter_value: Optional filter value
    
    Returns:
        Dict mapping status to count
    """
    query = select(status_column, func.count(model.id))
    
    if filter_column is not None and filter_value is not None:
        query = query.where(filter_column == filter_value)
    
    query = query.group_by(status_column)
    
    result = await db.execute(query)
    return {row[0]: row[1] for row in result.fetchall()}


async def exists(
    db: AsyncSession,
    model,
    **filters,
) -> bool:
    """
    Check if a record exists efficiently.
    
    Args:
        db: Database session
        model: Model class
        **filters: Column filters
    
    Returns:
        True if record exists
    """
    query = select(func.count(model.id)).limit(1)
    
    for column, value in filters.items():
        query = query.where(getattr(model, column) == value)
    
    result = await db.execute(query)
    return (result.scalar() or 0) > 0


async def get_or_none(
    db: AsyncSession,
    model,
    id: str,
) -> Optional[Any]:
    """
    Get a record by ID or return None (avoids exception).
    
    Args:
        db: Database session
        model: Model class
        id: Record ID
    
    Returns:
        Record or None
    """
    return await db.get(model, id)


def apply_search_filter(query, columns, search_term: str):
    """
    Apply search filter across multiple columns.
    
    Args:
        query: SQLAlchemy query
        columns: List of columns to search
        search_term: Search term
    
    Returns:
        Filtered query
    """
    if not search_term:
        return query
    
    from sqlalchemy import or_
    
    search_pattern = f"%{search_term}%"
    conditions = [col.ilike(search_pattern) for col in columns]
    
    return query.where(or_(*conditions))


def apply_date_range_filter(query, column, start_date=None, end_date=None):
    """
    Apply date range filter.
    
    Args:
        query: SQLAlchemy query
        column: Date column
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
    
    Returns:
        Filtered query
    """
    if start_date:
        query = query.where(column >= start_date)
    if end_date:
        query = query.where(column <= end_date)
    return query


def apply_sorting(query, column, order: str = "desc"):
    """
    Apply sorting to query.
    
    Args:
        query: SQLAlchemy query
        column: Column to sort by
        order: "asc" or "desc"
    
    Returns:
        Sorted query
    """
    if order.lower() == "asc":
        return query.order_by(column.asc())
    return query.order_by(column.desc())
