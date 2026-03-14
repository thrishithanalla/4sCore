1. FeedbackMaster 
meta:
 dbName: "feedbackMaster"
 displayName: "Feedback Master"
 description: "Registry defining component metadata, type, and predefined feedback option sets for mapping user feedback."
 ownerDepartment: "AI Platform/Core"
 ownerTeam: "Feedback & Quality Intelligence"
 purpose: "To define and manage component types, metadata, and rating/response options associated with user feedback."
 platform: "MongoDB"
 auditFields: ["createdAt", "createdBy", "updatedAt", "updatedBy", "createIp", "updatedIp"]
 softDelete: { enabled: false, field: null }

fields
_id — label: Document Id
purpose: Primary key for each FeedbackMaster entry
 details: type=ObjectId, required=true, nullable=false, pk=true, fk=none, autoInc=false

name — label: Component Master Name
purpose: Human-readable name of the master entry
 details: type=String, length=300, required=true, nullable=false

componentType — label: Component Type
purpose: Classifies the component for which feedback is captured
 details: type=String, enum=["prompt","api","function"], required=true, nullable=false

options — label: Feedback Options
purpose: List of predefined selectable feedback options
 details: type=Array[String], required=false, nullable=true

createdBy — label: Created By
purpose: Tracks which user created the FeedbackMaster entry
 details: type=ObjectId, fk=Users._id, required=false, nullable=true

createdAt — label: Created At
purpose: Timestamp when the entry was created
 details: type=Date, required=true, nullable=false, default=now, index=single(desc)

updatedBy — label: Updated By
purpose: Tracks which user modified the entry
 details: type=ObjectId, fk=Users._id, required=false, nullable=true

updatedAt — label: Updated At
purpose: Timestamp of last modification
 details: type=Date, required=false, nullable=true, index=single(desc)

createIp — label: Created IP Address
purpose: IP address of the creator
 details: type=String, required=false, nullable=true

updatedIp — label: Updated IP Address
purpose: IP address of the last editor
 details: type=String, required=false, nullable=true

constraints
name is not required to be unique.


componentType must be one of: "prompt", "api", "function".


createdBy and updatedBy must reference valid Users.



indexes
idx_createdAt_desc — { createdAt: -1 }
 idx_updatedAt_desc — { updatedAt: -1 }

relationships
withModel: "Users" — type: "N-1" via createdBy, updatedBy
 withModel: "Feedback" — type: "1-N" via FeedbackMasterId



test example
{
  "name": "Prompt Output Quality",
  "componentType": "prompt",
  "options": ["Not accurate", "Too long", "Missing details"],
  "createdBy": "6                             728b9f0812d4c07f9a41ef2",
  "createdAt": "2025-12-09T10:20:00Z",
  "updatedAt": "2025-12-09T11:45:00Z"
}


2. Feedback 
meta:
 dbName: "feedback"
 displayName: "User Feedback"
 description: "Stores user-submitted evaluations, expectations, and sentiment linked to a FeedbackMaster definition."
 ownerDepartment: "AI Platform/Core"
 ownerTeam: "Feedback & Quality Intelligence"
 purpose: "To record user insight, reactions, improvements, and satisfaction for any system component."
 platform: "MongoDB"
 auditFields: ["createdAt","createdBy","updatedAt","updatedBy","createIp","updatedIp"]
 softDelete: { enabled: false, field: null }

fields
_id — label: Feedback Document Id
purpose: Unique identifier for each feedback record
 details: type=ObjectId, required=true, nullable=false, pk=true

FeedbackMasterId — label: Feedback Master Reference
purpose: Links feedback to the component definition in FeedbackMaster
 details: type=ObjectId, required=true, nullable=false, fk=FeedbackMaster._id

componentId — label: Component Reference Id
purpose: Identifier linking to the specific component instance
 details: type=Integer, required=false, nullable=true

componentExecutionId — label: Component Execution Identifier
purpose: Represents the run/execution identifier of the component
 details: type=String, required=false, nullable=true

UserFeedback — label: User Feedback Context
purpose: Stores the user’s question and expected output
 details: type=Object, required=true, nullable=false, schema={ userQuestion:String, userExpectedOutput:String }

IsLiked — label: Like Status
purpose: Indicates user satisfaction
 details: type=Boolean, required=false, nullable=true

FeedbackResponse — label: User Feedback Response
purpose: Stores descriptive user feedback
 details: type=String, length=2000, required=false, nullable=true

ReasonForDislike — label: Dislike Reason
purpose: Records reason when IsLiked = false
 details: type=String, length=1000, required=false, nullable=true

Rating — label: Rating
purpose: Captures numeric rating
 details: type=Double, required=false, nullable=true
IsRegenerated — label: Regeneration Status
purpose: Indicates if the evaluation is for a regenerated output
 details: type=Boolean, required=false, nullable=true

createdBy — label: Created By
purpose: Indicates which user submitted feedback
 details: type=ObjectId, fk=Users._id, required=false, nullable=true

createdAt — label: Created At
purpose: Timestamp when feedback was created
 details: type=Date, default=now, required=true, nullable=false, index=single(desc)

updatedBy — label: Updated By
purpose: Indicates who last modified feedback
 details: type=ObjectId, fk=Users._id, required=false, nullable=true

updatedAt — label: Updated At
purpose: Timestamp of latest update
 details: type=Date, required=false, nullable=true, index=single(desc)

createIp — label: Creator IP
purpose: Tracks originating IP
 details: type=String, required=false, nullable=true
updatedIp — label: Editor IP
purpose: Tracks last update IP
 details: type=String, required=false, nullable=true
constraints
FeedbackMasterId must reference a valid FeedbackMaster document.


UserFeedback.userQuestion and UserFeedback.userExpectedOutput are mandatory.


indexes
idx_createdAt_desc — { createdAt: -1 }
 idx_FeedbackMasterId — { FeedbackMasterId: 1 }

relationships
withModel: "FeedbackMaster" — type: "N-1" via FeedbackMasterId
 withModel: "Users" — type: "N-1" via createdBy


sample JSON
{
  "_id": "65163e9f5e22f2f7c00e5678",
  "FeedbackMasterId": "65163e9f5e22f2f7c00e1234",
  "UserFeedback": {
    "userQuestion": "Summarize the quarterly sales report for Q3.",
    "userExpectedOutput": "A three-bullet summary focusing on key revenue metrics."
  },
  "componentId": 101,
  "componentExecutionId": "promptExecutionOne",
  "IsLiked": false,
  "FeedbackResponse": "The summary was too long and missed key financial details.",
  "ReasonForDislike": "Not accurate",
  "Rating": 2.5,
  "IsRegenerated": false,
  "createdAt": "2024-12-09T08:05:00.000Z"
}


