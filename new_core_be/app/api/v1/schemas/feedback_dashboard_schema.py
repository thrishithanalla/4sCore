"""
Feedback Dashboard Schema
Comprehensive schemas for feedback analytics and reporting
Routes: /api/v1/feedback-dashboard
"""
from __future__ import annotations

from datetime import datetime, date
from enum import Enum
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================

class FeedbackTimeRangeEnum(str, Enum):
    """Supported time ranges for feedback dashboard"""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7_DAYS = "7d"
    LAST_30_DAYS = "30d"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    CUSTOM = "custom"


class FeedbackGranularityEnum(str, Enum):
    """Time granularity for trend data"""
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ComponentTypeEnum(str, Enum):
    """Component types for feedback"""
    SCREEN = "screen"
    PROMPT = "prompt"
    API = "api"
    FUNCTION = "function"


# =============================================================================
# Stats Schemas
# =============================================================================

class FeedbackStats(BaseModel):
    """Summary statistics for feedback"""
    totalFeedback: int = Field(default=0, description="Total feedback count")
    likedCount: int = Field(default=0, description="Count of liked feedback (isLiked=true)")
    dislikedCount: int = Field(default=0, description="Count of disliked feedback (isLiked=false)")
    neutralCount: int = Field(default=0, description="Count of feedback with no like/dislike (isLiked=null)")
    averageRating: Optional[float] = Field(default=None, description="Average rating across all feedback")
    likePercentage: float = Field(default=0.0, description="Percentage of liked feedback")
    dislikePercentage: float = Field(default=0.0, description="Percentage of disliked feedback")


class FeedbackStatsByComponent(BaseModel):
    """Stats breakdown by component type"""
    componentType: str = Field(..., description="Component type (screen/prompt/api/function)")
    totalFeedback: int = Field(default=0, description="Total feedback for this component type")
    likedCount: int = Field(default=0, description="Liked count")
    dislikedCount: int = Field(default=0, description="Disliked count")
    averageRating: Optional[float] = Field(default=None, description="Average rating")


class FeedbackStatsByModule(BaseModel):
    """Stats breakdown by module"""
    moduleId: str = Field(..., description="Module ID")
    moduleName: Optional[str] = Field(None, description="Module name")
    totalFeedback: int = Field(default=0, description="Total feedback for this module")
    likedCount: int = Field(default=0, description="Liked count")
    dislikedCount: int = Field(default=0, description="Disliked count")
    averageRating: Optional[float] = Field(default=None, description="Average rating")


# =============================================================================
# Trend Schemas (Graph Data)
# =============================================================================

class FeedbackTrendPoint(BaseModel):
    """Single data point for trend graph"""
    timestamp: datetime = Field(..., description="Time bucket start")
    date: Optional[str] = Field(None, description="Date string for display (YYYY-MM-DD)")
    totalFeedback: int = Field(default=0, description="Total feedback in period")
    likedCount: int = Field(default=0, description="Liked count in period")
    dislikedCount: int = Field(default=0, description="Disliked count in period")
    neutralCount: int = Field(default=0, description="Neutral count in period")
    averageRating: Optional[float] = Field(default=None, description="Average rating in period")


# =============================================================================
# Feedback List Item Schema
# =============================================================================

class PersonnelInfo(BaseModel):
    """Personnel information for feedback"""
    personnelId: str = Field(..., description="Personnel ID")
    name: Optional[str] = Field(None, description="Personnel full name")
    rank: Optional[str] = Field(None, description="Personnel rank")
    unitId: Optional[str] = Field(None, description="Unit ID")
    unitName: Optional[str] = Field(None, description="Unit name")
    districtName: Optional[str] = Field(None, description="District name")


class FeedbackListItem(BaseModel):
    """Single feedback item for list view"""
    id: str = Field(..., alias="_id", description="Feedback ID")
    feedbackMasterId: str = Field(..., description="Feedback master ID")
    feedbackMasterName: Optional[str] = Field(None, description="Feedback master name")
    componentType: Optional[str] = Field(None, description="Component type")
    moduleId: Optional[str] = Field(None, description="Module ID")
    moduleName: Optional[str] = Field(None, description="Module name")

    # Feedback details
    isLiked: Optional[bool] = Field(None, description="Like/dislike status")
    rating: Optional[float] = Field(None, description="Rating value")
    comment: Optional[str] = Field(None, description="User comment")
    quickFeedback: Optional[List[str]] = Field(None, description="Quick feedback options selected")
    state: Optional[str] = Field(None, description="Feedback state")

    # User feedback structure details
    userFeedback: Optional[Dict[str, Any]] = Field(None, description="Structured user feedback data")

    # Personnel who gave feedback
    personnel: Optional[PersonnelInfo] = Field(None, description="Personnel who submitted feedback")

    # Timestamps
    createdAt: Optional[datetime] = Field(None, description="When feedback was submitted")

    class Config:
        populate_by_name = True


# =============================================================================
# Top Negative Feedback Schemas
# =============================================================================

class SeverityLevel(str, Enum):
    """Severity levels based on negative feedback count"""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class TopNegativeItem(BaseModel):
    """Single item in top negative feedback list"""
    feedbackMasterId: str = Field(..., description="Feedback master ID")
    feedbackMasterName: str = Field(..., description="Feedback master name")
    componentType: str = Field(..., description="Component type")
    moduleId: Optional[str] = Field(None, description="Module ID")
    moduleName: Optional[str] = Field(None, description="Module name")

    # Counts
    totalReports: int = Field(default=0, description="Total negative reports")
    dislikedCount: int = Field(default=0, description="Count where isLiked=false")
    lowRatingCount: int = Field(default=0, description="Count where rating < threshold")

    # Metrics
    averageRating: Optional[float] = Field(None, description="Average rating")
    severity: SeverityLevel = Field(..., description="Severity level based on count")

    # Status tracking (can be updated by admin)
    status: Optional[str] = Field(default="OPEN", description="Issue status")


class TopNegativeResponse(BaseModel):
    """Response for top negative feedback API"""
    items: List[TopNegativeItem] = Field(default_factory=list, description="Top negative items")
    totalNegativeFeedback: int = Field(default=0, description="Total negative feedback count")
    ratingThreshold: float = Field(default=2.5, description="Rating threshold used")


# =============================================================================
# Negative Reports Detail Schema
# =============================================================================

class NegativeReportDetail(BaseModel):
    """Detailed report for negative feedback"""
    id: str = Field(..., alias="_id", description="Feedback ID")

    # Personnel info
    personnel: Optional[PersonnelInfo] = Field(None, description="Personnel who submitted")

    # Feedback details
    isLiked: Optional[bool] = Field(None, description="Like/dislike status")
    rating: Optional[float] = Field(None, description="Rating value")
    comment: Optional[str] = Field(None, description="User comment")
    quickFeedback: Optional[List[str]] = Field(None, description="Quick feedback options")
    state: Optional[str] = Field(None, description="Feedback state")

    # Component-specific data
    userFeedback: Optional[Dict[str, Any]] = Field(None, description="Full user feedback structure")

    # Timestamps
    createdAt: Optional[datetime] = Field(None, description="Submission time")

    class Config:
        populate_by_name = True


class NegativeReportsResponse(BaseModel):
    """Response for negative reports detail API"""
    feedbackMasterId: str = Field(..., description="Feedback master ID")
    feedbackMasterName: str = Field(..., description="Feedback master name")
    componentType: str = Field(..., description="Component type")
    moduleId: Optional[str] = Field(None, description="Module ID")
    moduleName: Optional[str] = Field(None, description="Module name")

    # Summary
    totalReports: int = Field(default=0, description="Total reports")
    averageRating: Optional[float] = Field(None, description="Average rating")

    # Detailed reports
    reports: List[NegativeReportDetail] = Field(default_factory=list, description="Detailed reports")

    # Pagination
    page: int = Field(default=1, description="Current page")
    pageSize: int = Field(default=20, description="Page size")
    totalPages: int = Field(default=1, description="Total pages")


# =============================================================================
# Combined Dashboard Response
# =============================================================================

class FeedbackDashboardData(BaseModel):
    """Combined feedback dashboard data"""
    # Summary stats
    stats: FeedbackStats = Field(..., description="Overall statistics")

    # Stats by component type
    statsByComponent: List[FeedbackStatsByComponent] = Field(
        default_factory=list,
        description="Stats breakdown by component type"
    )

    # Stats by module
    statsByModule: List[FeedbackStatsByModule] = Field(
        default_factory=list,
        description="Stats breakdown by module"
    )

    # Trend data for graphs
    trend: List[FeedbackTrendPoint] = Field(
        default_factory=list,
        description="Time series trend data"
    )

    # Recent feedback list
    recentFeedback: List[FeedbackListItem] = Field(
        default_factory=list,
        description="Recent feedback items with personnel details"
    )

    # Pagination for feedback list
    pagination: Optional[Dict[str, Any]] = Field(
        None,
        description="Pagination info for feedback list"
    )


class FeedbackDashboardResponse(BaseModel):
    """API response wrapper for feedback dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Feedback dashboard data retrieved successfully")
    data: FeedbackDashboardData
