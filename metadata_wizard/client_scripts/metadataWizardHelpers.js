function addFields(input_field_names_or_dicts){
    var new_field_nums_and_names = [];
    var is_dicts = !Array.isArray(input_field_names_or_dicts);

    // If the input is a list and the list has nothing in it, bail out without doing anything
    if ((!is_dicts) && (input_field_names_or_dicts.length === 0)){
        return;
    }

    for (var curr_item in input_field_names_or_dicts) {
        var curr_field_dict = null;
        var curr_field_name = input_field_names_or_dicts[curr_item];
        if (is_dicts) {
            curr_field_dict = curr_field_name;
            curr_field_name = curr_field_dict[g_transferred_variables.ELEMENT_IDENTIFIERS.FIELD_NAME];
        }

        // TODO: someday: Should I run the usual validations here instead of when adding from form?
        // Basically, question is: do I trust that fields coming in from an existing spreadsheet will be valid?
        if ((curr_field_name !== "") && (!g_fields_state.hasExistingField(curr_field_name))) {
            g_fields_state.addExistingField(curr_field_name);

            var new_html = generateFieldHtml(curr_field_name);
            $('<div/>', {html: new_html}).appendTo(getIdSelectorFromId(g_transferred_variables.ELEMENT_IDENTIFIERS.FIELD_DETAILS_DIV));

            // once the new elements exist, set up events/etc
            decorateNewElements(g_fields_state.getCurrentNextFieldNum());

            if (curr_field_dict !== null) {
                // Ugh, allowed_missing_vals[] is a terrible PITA that needs to be set FIRST because otherwise the
                // default stuff gets all confused
                if (curr_field_dict["allowed_missing_vals[]"]) {
                    readInAndResetFormField(curr_field_dict, "allowed_missing_vals[]");
                    delete curr_field_dict["allowed_missing_vals[]"];
                }

                // Now loop over everything else
                for (var curr_field_key in curr_field_dict) {
                    readInAndResetFormField(curr_field_dict, curr_field_key);
                }
            }

            new_field_nums_and_names.push([g_fields_state.getCurrentNextFieldNum(), curr_field_name]);
            g_fields_state.incrementNextFieldNum();
        }
    }

    // add new values to the select list for field_names_sel
    var field_names_sel_id_selector = getIdSelectorFromId(g_transferred_variables.ELEMENT_IDENTIFIERS.FIELD_NAMES_SELECT);
    updateSelectWithNewCategories(field_names_sel_id_selector, new_field_nums_and_names, null, false,
        true, true, true);

    // show the div with the field names and details
    $(getIdSelectorFromId(g_transferred_variables.ELEMENT_IDENTIFIERS.EXISTING_FIELDS_DIV)).removeClass('hidden');
}

function readInAndResetFormField(curr_field_dict, curr_field_key) {
    var input_value = curr_field_dict[curr_field_key];
    var input_name= getIdentifierFromBaseNameAndFieldIndex(curr_field_key, g_fields_state.getCurrentNextFieldNum());

    // TODO: someday: refactor hard-coded square brackets
    if (curr_field_key.endsWith("[]")) {
        // TODO: someday: must find better way to place brackets ... also icky in template.html
        input_name = input_name.replace("[]", "");
        input_name = input_name + "[]";
        // assume we're dealing with values from a checkbox fieldset
        for (var curr_checkbox_val_index in input_value){
            // only trigger onchange event after setting last value in field;
            // otherwise, since fields come through dictionary in basically arbitrary order,
            // effect of partial change of allowed missing checkboxes can wipe out
            // allowed missing default select, if that happened to come through first,
            // because of allowed missing fieldset's onchange's call to resetSelectedOptionIfDisabled.

            // NB: Ignore pycharm conversion warning--actively WANT conversion here, since
            // curr_checkbox_val_index is a string representation of an int and input_value.length-1 is
            // an ACTUAL integer
            var trigger_onchange = curr_checkbox_val_index == input_value.length-1;
            setFormValue(input_name, input_value[curr_checkbox_val_index], trigger_onchange);
        }
    } else {
        setFormValue(input_name, input_value, true);
    }
}

function setFormValue(input_name, input_value, trigger_onchange){
    var input_name_selector = "[name='" + input_name + "']";
    var input_selector = input_name_selector;
    var input_element = $(input_name_selector);
    var input_type = getElementType(input_element);

    // TODO: someday: refactor out option selector generation?
    switch(input_type) {
        case "checkbox":
            // NB: INTENTIONAL FALL-THROUGH to text case!  Do NOT add break here.
        case "radio":
            input_selector = input_name_selector + "[value='" + input_value + "']";
            $(input_selector).prop("checked", true);
            break;
        case "select":
            // NB: Don't reset input_selector: for select boxes, onchange is on select, not on option
            $(input_name_selector + " option[value='" + input_value + "']").prop("selected", true);
            break;
        case "textarea":
            $(input_name_selector).html(input_value);
            break;
        case "hidden":
            // NB: INTENTIONAL FALL-THROUGH to text case!  Do NOT add break here.
        case "text":
            $(input_name_selector).attr("value", input_value);
            break;
        default:
            throw "Unsupported input type '" + input_type + "'";
    }

    if (trigger_onchange) {
        // Manually trigger onchange event, if any, of changed form element(s)
        $(input_selector).change();
    }
}

// From https://stackoverflow.com/a/9116746
function getElementType(element){
    return element[0].tagName == "INPUT" ? element[0].type.toLowerCase() : element[0].tagName.toLowerCase();
}

function findFieldIndexFromNameOrId(field_identifier){
    var result = null;  // default: assume field has no index (like "study_name")
    var id_pieces = field_identifier.split(g_transferred_variables.SEPARATOR);
    var field_num_str = id_pieces[id_pieces.length-1];
    // Check if string contains a valid integer, per https://stackoverflow.com/a/35759874
    if (!isNaN(field_num_str) && !isNaN(parseFloat(field_num_str))){
        result = parseInt(field_num_str);
    }
    return result;
}

function getFieldNameValueByIndex(field_index) {
    var field_name_input_id_selector = getIdSelectorFromBaseNameAndFieldIndex(g_transferred_variables.ELEMENT_IDENTIFIERS.FIELD_NAME, field_index);
    var field_name_input = $(field_name_input_id_selector)[0];
    return field_name_input.value;
}

function validatePutativeFieldName(putative_field_name){
    var error_msgs = [];
    error_msgs.push(validateNameIsNotReserved(putative_field_name));
    error_msgs.push(validateNameDoesNotHaveReservedSuffix(putative_field_name));
    error_msgs.push(validateNameMatchesPattern(putative_field_name));
    error_msgs.push(validateNameIsUnique(putative_field_name));
    // (filter - JS 1.6 and above)
    error_msgs = error_msgs.filter(function(x){ return x !== null });
    return error_msgs;
}

function validateNameIsNotReserved(putative_field_name) {
    var result = null;
    // if the value in the name element appears in the list of reserved words, then it is invalid
    if (g_fields_state.getReservedWords().indexOf(putative_field_name) > -1) {
        result = "'" + putative_field_name + "' is not an allowed field name because it is a reserved word.";
    }
    return result;
}

function validateNameDoesNotHaveReservedSuffix(putative_field_name) {
    var result = null;
    // if the value in the name element ends with one of the reserved suffixes, then it is invalid
    var reserved_suffixes_list = g_fields_state.getReservedSuffixes();
    for (var i = 0; i < reserved_suffixes_list.length; i++){
        var curr_reserved_suffix = reserved_suffixes_list[i];
        if (putative_field_name.endsWith(curr_reserved_suffix)) {
            result = "'" + putative_field_name + "' is not an allowed field name because it ends with the reserved suffix '" + curr_reserved_suffix + "'.";
            break;
        }
    }
    return result;
}

function validateNameMatchesPattern(putative_field_name) {
    var result = null;
    if (!g_transferred_variables.FIELD_NAME_REGEX.test(putative_field_name)) {
        result = "Only lower-case letters, numbers, and underscores are permitted, and must not start with a number.";
    }
    return result;
}

function validateNameIsUnique(putative_field_name) {
    var result = null; // default: assume unique
    if (g_fields_state.hasExistingField(putative_field_name)){
        result = "Field name must be unique."
    }
    return result;
}

function addAlwaysRequiredRule(field_index, required_base_name) {
    var id_selector = getIdSelectorFromBaseNameAndFieldIndex(required_base_name, field_index);
    $(id_selector).rules("add", {
       required: true
    });
}

function addConditionalIsNotNoneRule(field_index, condition_base_name, required_base_name) {
    var id_selector = getIdSelectorFromBaseNameAndFieldIndex(condition_base_name, field_index);

    // For JQuery validation plugin, custom validator functions always have
    // first argument: the current value of the validated element. Second argument: the element to be validated
    $(id_selector).rules("add", {
        isNotNone: {
            depends: function (value, element) {
                return doesElementHaveValue(required_base_name, field_index);
            }
        }
    });
}

function addRequiredIfNotNoneRule(field_index, condition_base_name, required_base_name) {
    var id_selector = getIdSelectorFromBaseNameAndFieldIndex(condition_base_name, field_index);

    // For JQuery validation plugin, custom validator functions always have
    // first argument: the current value of the validated element. Second argument: the element to be validated
    $(id_selector).rules("add", {
        required:  {
            depends: function() {
                var selectbox_id_selector = getIdSelectorFromBaseNameAndFieldIndex(required_base_name, field_index);
                // TODO: someday: replace hardcoding of none-value
                // The comparison value is required only if the comparison type is not none
                return ($(selectbox_id_selector).val() !== "no_comparison");
            }
        }
    });
}

function addDateTimeValidationRule(field_index, required_base_name){
    var id_selector = getIdSelectorFromBaseNameAndFieldIndex(required_base_name, field_index);
    $(id_selector).rules("add", {
        isValidDateTime: true
    });
}

function addOnChangeEvent(field_index, base_name, onChangeFunc) {
    var new_func = function (event) {
        var result = onChangeFunc(event);
        validateFormIfSubmitted();
        return result;
    };
    addEventHandler("change", field_index, base_name, new_func);
}

function addEventHandler(event_name, field_index, base_name, onEventFunc){
    var id_selector = getIdSelectorFromBaseNameAndFieldIndex(base_name, field_index);
    $(id_selector).on( event_name, {field_index:field_index}, onEventFunc)
}

function doesElementHaveValue(base_name, field_index) {
    var result = true; //default
    var element_id = getIdSelectorFromBaseNameAndFieldIndex(base_name, field_index);
    var element_val = $(element_id)[0].value;
    if (!($.trim(element_val)).length) {result = false;} // see https://stackoverflow.com/a/1854584
    return result;
}

function enableOrDisableByValue(base_name, field_index, curr_val, enable_value) {
    var element_id_selector = getIdSelectorFromBaseNameAndFieldIndex(base_name, field_index);
    enableOrDisableBySelectorAndValue(element_id_selector, curr_val, enable_value);
}

function enableOrDisableBySelectorAndValue(element_selector, curr_val, enable_value){
    if (curr_val === enable_value) {
        $(element_selector).removeAttr("disabled");
    } else {
        $(element_selector).prop('disabled', 'disabled');
    }
}

function showEnableOrHideDisable(curr_selector, do_show){
    // update the element's display state (either way)
    if (!do_show)  {
        $(curr_selector).addClass('hidden');
        $(curr_selector + ' :input').attr('disabled', true);
    } else {
        $(curr_selector).removeClass('hidden');
        // Note this enables everything.  If you need to have somethings still disabled,
        // go back afterwards and (re-)disable them
        $(curr_selector + ' :input').removeAttr('disabled');
        $(curr_selector).slideDown();
    }
}

function resetSelectedOptionIfDisabled(select_id_selector){
    var selected_option = $(select_id_selector).find('option:selected');
    var disabled_val = selected_option.attr('disabled');
    var enabled = (disabled_val === false) || (disabled_val === undefined);

    // if the currently selected option is now disabled, reset which option is selected to be the
    // placeholder option
    if (!enabled) {$(select_id_selector).val("");}
}

function updateSelectWithNewCategories(select_id_selector, values_list, selected_value, add_placeholder,
                                       list_has_dual_values, retain_existing, fixed_size){
    function build_option_str(new_val, new_text, is_selected) {
        var selected_str = "";
        if (is_selected) {selected_str = "selected"}
        return '<option value="' + new_val + '" ' + selected_str + '>' + new_text + '</option>'
    }

    // add new options
    var new_options = [];
    if (add_placeholder === null) {add_placeholder = true;}
    if (add_placeholder) {
        new_options.push(build_option_str("", "--Select One--", false))
    }

    if (retain_existing) {
        // first add the existing options to the "new options" list
        new_options.push($(select_id_selector).html());
    }

    for (var i = 0; i < values_list.length; i++) {
        var new_val = values_list[i];
        var new_text = new_val;
        if (list_has_dual_values) {
            new_val = values_list[i][0];
            new_text = values_list[i][1];
        }

        var is_selected = (new_val === selected_value);
        new_options.push(build_option_str(new_val, new_text, is_selected));
    }

    $(select_id_selector).html(new_options.join(''));
    var num_options = values_list.length;
    if (fixed_size){
        num_options = null;
    }
    setSelectSize(select_id_selector, num_options);
}

// num_options is optional.  If you want the select box to be the minimum of the number of options or the max size,
// include this argument.  If you want the select box to always be the max size, just pass null for this argument.
function setSelectSize(select_id_selector, num_options){
    var size = g_transferred_variables.MAX_SELECTBOX_SIZE;
    if (num_options !== null) {
        // set the size of the select box to be the number of categories or the max
        size = Math.min(num_options, g_transferred_variables.MAX_SELECTBOX_SIZE)
    }
    $(select_id_selector).attr('size', size)
}

function getTemplateFromBaseIdentifier(base_name){
    return base_name + g_transferred_variables.TEMPLATE_SUFFIX;
}

function getIdSelectorFromBaseNameAndFieldIndex(base_name, field_index) {
    var id = getIdentifierFromBaseNameAndFieldIndex(base_name, field_index);
    return getIdSelectorFromId(id);
}

function getIdentifierFromBaseNameAndFieldIndex(base_name, field_index) {
    var full_template_name = getTemplateFromBaseIdentifier(base_name);
    return getNewIdentifierFromTemplateAndIndex(full_template_name, field_index);
}

function getIdSelectorFromId(id_str) {
    return "#" + id_str;
}

function getNewIdentifierFromTemplateAndIndex(full_template_name, field_index) {
    return full_template_name.replace(g_transferred_variables.TEMPLATE_SUFFIX, g_transferred_variables.SEPARATOR + field_index.toString());
}