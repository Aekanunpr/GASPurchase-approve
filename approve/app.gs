// Define the approval flows in this object
const FLOWS = {
    defaultFlow: [
        {
            email: "testjubjub101@gmail.com",
            name: "BOB (default 1)",
            title: "Team Lead"
        },
        {
            email: "testjubjub101@gmail.com",
            name: "ADUM (default 2)",
            title: "Manager"
        }
    ],
    Dept1: [
        {
            email: "testjubjub101@gmail.com",
            name: "HR Lead",
            title: "HR Team Lead"
        },
        {
            email: "testjubjub101@gmail.com",
            name: "HR Manager",
            title: "HR Manager"
        },
    ],
    Dept2: [
        {
            email: "testjubjub101@gmail.com",
            name: "IT Lead",
            title: "IT Team Lead"
        },
        {
            email: "testjubjub101@gmail.com",
            name: "IT Manager",
            title: "IT Manager"
        },
        {
            email: "testjubjub101@gmail.com",
            name: "IT President",
            title: "IT President"
        },
    ]
}

function App() {
    this.form = FormApp.getActiveForm()
    this.formUrl = this.form.getPublishedUrl()
    this.url = "https://script.google.com/macros/s/AKfycbzEydA1WzFpv1YK-Lx14xmiOjHrYNRB99OaC14yDrb-Bn-fwDsebXnwHTHEdEL_Smg6tA/exec" // IMPORTANT - copy the web app url after deploy
    this.title = this.form.getTitle()
    this.desription = this.form.getDescription()
    this.sheetname = "Form Responses 1" // DO NOT change - the default google form responses sheet name
    this.flowHeader = "Department Check" // IMPORTANT - key field for your flows
    this.uidHeader = "_uid"
    this.uidPrefix = "UID-"
    this.uidLength = 5
    this.statusHeader = "_status"
    this.responseIdHeader = "_response_id"
    this.emailHeader = "Email"  // DO NOT CHANGE - make sure email collection is enabled in Google Form

    this.pending = "Pending"
    this.approved = "Approved"
    this.rejected = "Rejected"
    this.waiting = "Waiting"


    this.sheet = (() => {
        let sheet
        try {
            const id = this.form.getDestinationId()
            sheet = SpreadsheetApp.openById(id)
        } catch (e) {
            const id = this.form.getId()
            const file = DriveApp.getFileById(id)
            const parentFolder = file.getParents().next()
            const spreadsheet = SpreadsheetApp.create(this.title + " (Responses)")
            const ssId = spreadsheet.getId()
            this.form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId)
            DriveApp.getFileById(ssId).moveTo(parentFolder)
            sheet = spreadsheet
        }
        return sheet.getSheetByName(this.sheetname)
    })()

    this.parsedValues = () => {
        const values = this.sheet.getDataRange().getDisplayValues()
        const parsedValues = values.map(value => {
            return value.map(cell => {
                try {
                    return JSON.parse(cell)
                } catch (e) {
                    return cell
                }
            })
        })
        return parsedValues
    }

    this.getTaskById = (id) => {
        const values = this.parsedValues()
        const record = values.find(value => value.some(cell => cell.taskId === id))
        const row = values.findIndex(value => value.some(cell => cell.taskId === id)) + 1

        const headers = values[0]
        const statusColumn = headers.indexOf(this.statusHeader) + 1
        let task
        let approver
        let nextApprover
        let column
        let approvers
        let email
        let status
        let responseId
        if (record) {
            task = record.slice(0, headers.indexOf(this.statusHeader) + 1).map((item, i) => {
                return {
                    label: headers[i],
                    value: item
                }
            })
            email = record[headers.indexOf(this.emailHeader)]
            status = record[headers.indexOf(this.statusHeader)]
            responseId = record[headers.indexOf(this.responseIdHeader)]
            approver = record.find(item => item.taskId === id)
            column = record.findIndex(item => item.taskId === id) + 1
            nextApprover = record[record.findIndex(item => item.taskId === id) + 1]
            approvers = record.filter(item => item.taskId)
        }
        return { email, status, responseId, task, approver, nextApprover, approvers, row, column, statusColumn }
    }

    this.getResponseById = (id) => {
        const values = this.parsedValues()
        const record = values.find(value => value.some(cell => cell === id))
        const headers = values[0]
        let task
        let approvers
        let status
        if (record) {
            task = record.slice(0, headers.indexOf(this.statusHeader) + 1).map((item, i) => {
                return {
                    label: headers[i],
                    value: item
                }
            })
            status = record[headers.indexOf(this.statusHeader)]
            approvers = record.filter(item => item.taskId)
        }
        return { task, approvers, status }
    }

    this.createUid = () => {
        const props = PropertiesService.getDocumentProperties()
        let uid = Number(props.getProperty(this.uidHeader))
        if (!uid) uid = 1

        props.setProperty(this.uidHeader, uid + 1)
        return this.uidPrefix + (uid + 10 ** this.uidLength).toString().slice(-this.uidLength)
    }

    this.resetUid = () => {
        const props = PropertiesService.getDocumentProperties()
        props.deleteProperty(this.uidHeader)
    }

    this.sendApproval = ({ task, approver, approvers }) => {
        const template = HtmlService.createTemplateFromFile("approval_email.html")
        template.title = this.title
        template.task = task
        template.approver = approver
        template.approvers = approvers
        template.actionUrl = `${this.url}?taskId=${approver.taskId}`
        template.formUrl = this.formUrl

        template.approved = this.approved
        template.rejected = this.rejected
        template.pending = this.pending
        template.waiting = this.waiting

        const subject = "Approval Required - " + this.title

        const options = {
            htmlBody: template.evaluate().getContent()
        }
        GmailApp.sendEmail(approver.email, subject, "", options)
    }

    this.sendNotification = (taskId) => {
        const { email, responseId, status, task, approvers } = this.getTaskById(taskId)
        console.log({ email, status, task, approvers })
        const template = HtmlService.createTemplateFromFile("notification_email.html")
        template.title = this.title
        template.task = task
        template.status = status
        template.approvers = approvers
        template.formUrl = this.formUrl
        template.approvalProgressUrl = `${this.url}?responseId=${responseId}`

        template.approved = this.approved
        template.rejected = this.rejected
        template.pending = this.pending
        template.waiting = this.waiting

        const subject = `Approval ${status} - ${this.title}`

        const options = {
            htmlBody: template.evaluate().getContent()
        }
        GmailApp.sendEmail(email, subject, "", options)
    }
      this.sendNotificationfinace = (taskId) => {
        const { email, responseId, status, task, approvers } = this.getTaskById(taskId)
        const emailF = "testjubjub101@gmail.com"//Chang Email Finace
        console.log({ email, status, task, approvers })
        const template = HtmlService.createTemplateFromFile("notification_email.html")
        template.title = this.title
        template.task = task
        template.status = status
        template.approvers = approvers
        template.formUrl = this.formUrl
        template.approvalProgressUrl = `${this.url}?responseId=${responseId}`

        template.approved = this.approved
        template.rejected = this.rejected
        template.pending = this.pending
        template.waiting = this.waiting

        const subject = `Approval ${status} - ${this.title}`

        const options = {
            htmlBody: template.evaluate().getContent()
        }
        GmailApp.sendEmail(emailF, subject, "", options)
    }

    // add addtional data to form response when update
    this.onFormSubmit = () => {
        const values = this.parsedValues()
        const headers = values[0]
        let lastRow = values.length
        let startColumn = headers.indexOf(this.uidHeader) + 1
        if (startColumn === 0) startColumn = headers.length + 1

        const responses = this.form.getResponses()
        const lastResponse = responses[responses.length - 1]
        const responseId = lastResponse.getId()
        const newHeaders = [this.uidHeader, this.statusHeader, this.responseIdHeader]
        const newValues = [this.createUid(), this.pending, responseId]

        const flowKey = values[lastRow - 1][headers.indexOf(this.flowHeader)]
        const flow = FLOWS[flowKey] || FLOWS.defaultFlow
        let taskId
        flow.forEach((item, i) => {
            newHeaders.push("_approver_" + (i + 1))

            item.comments = null
            item.taskId = Utilities.base64EncodeWebSafe(Utilities.getUuid())
            item.timestamp = new Date()
            if (i === 0) {
                item.status = this.pending
                taskId = item.taskId
            } else {
                item.status = this.waiting
            }
            if (i !== flow.length - 1) {
                item.hasNext = true
            } else {
                item.hasNext = false
            }
            newValues.push(JSON.stringify(item))
        })

        this.sheet.getRange(1, startColumn, 1, newHeaders.length)
            .setValues([newHeaders])
            .setBackgroundColor("#34A853")
            .setFontColor("#FFFFFF")

        this.sheet.getRange(lastRow, startColumn, 1, newValues.length).setValues([newValues])

        this.sendNotification(taskId)
        const { task, approver, approvers } = this.getTaskById(taskId)
        this.sendApproval({ task, approver, approvers })
        createDocFromForm();
    }

    this.approve = ({ taskId, comments }) => {
        const { task, approver, approvers, nextApprover, row, column, statusColumn } = this.getTaskById(taskId)
        if (!approver) return
        approver.comments = comments
        approver.status = this.approved
        approver.timestamp = new Date()
        this.sheet.getRange(row, column).setValue(JSON.stringify(approver))
        if (approver.hasNext) {
            nextApprover.status = this.pending
            nextApprover.timestamp = new Date()
            this.sheet.getRange(row, column + 1).setValue(JSON.stringify(nextApprover))
            this.sendApproval({ task, approver: nextApprover, approvers })
        } else {
            this.sheet.getRange(row, statusColumn).setValue(this.approved)
            this.sendNotification(taskId)
            this.sendNotificationfinace(taskId)
        }
    }

    this.reject = ({ taskId, comments }) => {
        const { task, approver, nextApprover, row, column, statusColumn } = this.getTaskById(taskId)
        if (!approver) return
        approver.comments = comments
        approver.status = this.rejected
        approver.timestamp = new Date()
        this.sheet.getRange(row, column).setValue(JSON.stringify(approver))
        this.sheet.getRange(row, statusColumn).setValue(this.rejected)
        this.sendNotification(taskId)
    }
    this.getAllData = (id) => {
        const values = this.parsedValues()
        const row = values.findIndex(value => value.some(cell => cell.taskId === id)) + 1
        
    }
}

function _onFormSubmit() {
    const app = new App()
    app.onFormSubmit()
}

function approve({ taskId, comments }) {
    const app = new App()
    app.approve({ taskId, comments })
}

function reject({ taskId, comments }) {
    const app = new App()
    app.reject({ taskId, comments })
}

function include(filename) {
    return HtmlService.createTemplateFromFile(filename).evaluate().getContent()
}


function doGet(e) {
    const { taskId, responseId } = e.parameter
    const app = new App()
    let template
    if (taskId) {
        template = HtmlService.createTemplateFromFile("index")
        const { task, approver, approvers, status } = app.getTaskById(taskId)
        template.task = task
        template.status = status
        template.approver = approver
        template.approvers = approvers
        template.url = `${app.url}?taskId=${taskId}`
    } else if (responseId) {
        template = HtmlService.createTemplateFromFile("approval_progress")
        const { task, approvers, status } = app.getResponseById(responseId)
        template.task = task
        template.status = status
        template.approvers = approvers
    } else {
        template = HtmlService.createTemplateFromFile("404.html")
    }

    template.title = app.title
    template.pending = app.pending
    template.approved = app.approved
    template.rejected = app.rejected
    template.waiting = app.waiting

    const htmlOutput = template.evaluate()
    htmlOutput.setTitle(app.title)
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    return htmlOutput
}

function resetUid(){
    const app = new App()
    app.resetUid()
}

function createTrigger(){
    const functionName = "_onFormSubmit"
    const triggers = ScriptApp.getProjectTriggers()
    const match = triggers.find(trigger => trigger.getHandlerFunction() === functionName)
    if (match) return 
    return ScriptApp.newTrigger(functionName).forForm(FormApp.getActiveForm()).onFormSubmit().create()
}

function onOpen(){
    const trigger = createTrigger()
    const ui = FormApp.getUi()
    const menu = ui.createMenu("Approval")
    menu.addItem("Reset UID", "resetUid")
    if (trigger) menu.addItem("Create trigger", "createTrigger")
    menu.addToUi()
}


const TEMPLATE_FILE_ID = '1UTbsfEOjKvq_Vhi9SQmbWcAw1QlRkC53C4WOBh25rMs';//ID File template google Drive
const DESTINATION_FOLDER_ID = '16sUbxzU4BUJ2NzEtEV1EpQitH_wPBssF';//ID Folder use save templat google Drive
const CURRENCY_SIGN = '$';


// Converts a float to a string value in the desired currency format
function toCurrency(num) {
    var fmt = Number(num).toFixed(2);
    return `${CURRENCY_SIGN}${fmt}`;
}

// Format datetimes to: YYYY-MM-DD
function toDateFmt(dt_string) {
  var millis = Date.parse(dt_string);
  var date = new Date(millis);
  var year = date.getFullYear();
  var month = ("0" + (date.getMonth() + 1)).slice(-2);
  var day = ("0" + date.getDate()).slice(-2);

  // Return the date in YYYY-mm-dd format
  return `${year}-${month}-${day}`;
}


// Parse and extract the data submitted through the form.
function parseFormData(values, header) {
    // Set temporary variables to hold prices and data.
    var subtotal = 0;
    var discount = 0;
    var response_data = {};

    // Iterate through all of our response data and add the keys (headers)
    // and values (data) to the response dictionary object.
    for (var i = 0; i < values.length; i++) {
      // Extract the key and value
      var key = header[i];
      var value = values[i];

      // If we have a price, add it to the running subtotal and format it to the
      // desired currency.
      if (key.toLowerCase().includes("price")) {
        subtotal += value;
        value = toCurrency(value);

      // If there is a discount, track it so we can adjust the total later and
      // format it to the desired currency.
      } else if (key.toLowerCase().includes("discount")) {
        discount += value;
        value = toCurrency(value);
      
      // Format dates
      } else if (key.toLowerCase().includes("date")) {
        value = toDateFmt(value);
      }

      // Add the key/value data pair to the response dictionary.
      response_data[key] = value;
    }

    // Once all data is added, we'll adjust the subtotal and total
    response_data["sub_total"] = toCurrency(subtotal);
    response_data["total"] = toCurrency(subtotal - discount);

    return response_data;
}

// Helper function to inject data into the template
function populateTemplate(document, response_data) {

    // Get the document header and body (which contains the text we'll be replacing).
    var document_header = document.getHeader();
    var document_body = document.getBody();

    // Replace variables in the header
    for (var key in response_data) {
      var match_text = `{{${key}}}`;
      var value = response_data[key];

      // Replace our template with the final values
      document_header.replaceText(match_text, value);
      document_body.replaceText(match_text, value);
    }

}


// Function to populate the template form
function createDocFromForm() {

  // Get active sheet and tab of our response data spreadsheet.
  var ss = SpreadsheetApp.openById('1CUIAO0DyuFy0fIhXsSYoRb8KHV-fb5rkBdXvJ1v_nQ0')//ID google Sheet
  var sheet = ss.getSheetByName('Form Responses 1')//Sheet name
  var last_row = sheet.getLastRow()-1;

  // Get the data from the spreadsheet.
  var range = sheet.getDataRange();
 
  // Identify the most recent entry and save the data in a variable.
  var data = range.getValues()[last_row];
  
  // Extract the headers of the response data to automate string replacement in our template.
  var headers = range.getValues()[0];

  // Parse the form data.
  var response_data = parseFormData(data, headers);

  // Retreive the template file and destination folder.
  var template_file = DriveApp.getFileById(TEMPLATE_FILE_ID);
  var target_folder = DriveApp.getFolderById(DESTINATION_FOLDER_ID);

  // Copy the template file so we can populate it with our data.
  // The name of the file will be the company name and the invoice number in the format: DATE_COMPANY_NUMBER
  var filename = `${response_data["Invoice Date"]}_${response_data["Company Name"]}_${response_data["Invoice Number"]}`;
  var document_copy = template_file.makeCopy(filename, target_folder);

  // Open the copy.
  var document = DocumentApp.openById(document_copy.getId());

  // Populate the template with our form responses and save the file.
  populateTemplate(document, response_data);
  document.saveAndClose();
    
}





