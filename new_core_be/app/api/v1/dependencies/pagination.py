"""
Pagination dependencies for FastAPI routes.
Provides standardized pagination parameter handling.
"""
from typing import Optional
from dataclasses import dataclass
from fastapi import Query


@dataclass
class PaginationParams:
    """Pagination parameters container"""
    page: Optional[int] = None
    page_size: Optional[int] = None
    skip: int = 0

    def __post_init__(self):
        if self.page is not None and self.page_size is not None:
            self.skip = (self.page - 1) * self.page_size


def get_pagination_params(
    page: Optional[int] = Query(
        None,
        ge=1,
        description="Page number (starting from 1). If not provided, returns all records."
    ),
    page_size: Optional[int] = Query(
        None,
        ge=1,
        le=1000,
        description="Number of items per page (max: 1000). Ignored if page is not provided."
    )
) -> PaginationParams:
    """
    FastAPI dependency for pagination parameters.

    Args:
        page: Page number (1-based, optional)
        page_size: Items per page (optional, max 1000)

    Returns:
        PaginationParams object with computed skip value
    """
    actual_page_size = page_size if page_size is not None else 10
    return PaginationParams(
        page=page,
        page_size=actual_page_size if page is not None else None
    )


def calculate_total_pages(total: int, page_size: int) -> int:
    """
    Calculate total number of pages.

    Args:
        total: Total number of items
        page_size: Items per page

    Returns:
        Total number of pages
    """
    if page_size <= 0:
        return 1
    return (total + page_size - 1) // page_size
