"""
Regex helpers for code validation.
"""

import re

# Accepts legacy separators (_ . : -)
ERRCODE_STRICT = re.compile(r"^[A-Za-z0-9_\.\:-]{3,120}$")

# Preferred namespaced form:
# ERR|NOTIF|LOG|PERM|VALUESET|CONFIG|WFSTEP|PROMPT|AGENT|CONN|TESTCASE
# + 1..6 segments (2..24 chars, A-Za-z0-9_-)
ERRCODE_PREFERRED = re.compile(
    r"^(ERR|NOTIF|LOG|PERM|VALUESET|CONFIG|WFSTEP|PROMPT|AGENT|CONN|TESTCASE)"
    r"(\.[A-Za-z0-9_-]{2,24}){1,6}$",
    re.IGNORECASE
)

# lowerCamelCase for {placeholders}
LOWER_CAMEL = re.compile(r"^[a-z]+[A-Za-z0-9]*$")

"""
ISO-639-1 language validation helpers.
"""

from typing import Set

ISO_639_1: Set[str] = {
    "aa","ab","ae","af","ak","am","an","ar","as","av","ay","az","ba","be","bg","bh","bi","bm","bn","bo","br","bs",
    "ca","ce","ch","co","cr","cs","cu","cv","cy","da","de","dv","dz","ee","el","en","eo","es","et","eu","fa","ff",
    "fi","fj","fo","fr","fy","ga","gd","gl","gn","gu","gv","ha","he","hi","ho","hr","ht","hu","hy","hz","ia","id",
    "ie","ig","ii","ik","io","is","it","iu","ja","jv","ka","kg","ki","kj","kk","kl","km","kn","ko","kr","ks","ku",
    "kv","kw","ky","la","lb","lg","li","ln","lo","lt","lu","lv","mg","mh","mi","mk","ml","mn","mr","ms","mt","my",
    "na","nb","nd","ne","ng","nl","nn","no","nr","nv","ny","oc","oj","om","or","os","pa","pi","pl","ps","pt","qu",
    "rm","rn","ro","ru","rw","sa","sc","sd","se","sg","si","sk","sl","sm","sn","so","sq","sr","ss","st","su","sv",
    "sw","ta","te","tg","th","ti","tk","tl","tn","to","tr","ts","tt","tw","ty","ug","uk","ur","uz","ve","vi","vo",
    "wa","wo","xh","yi","yo","za","zh","zu"
}

def assert_iso_639_1(code: str) -> str:
    """Return the code if valid; raise otherwise."""
    if code not in ISO_639_1:
        raise ValueError(f"language must be ISO-639-1; got '{code}'")
    return code

"""
Template validators (e.g., placeholder rules).
"""

import re

_PLACEHOLDER_RE = re.compile(r"\{([^{}]+)\}")

def assert_lower_camel_placeholders(template: str) -> str:
    """Ensure every {placeholder} is lowerCamelCase; return template otherwise raise."""
    for placeholder in _PLACEHOLDER_RE.findall(template or ""):
        if not LOWER_CAMEL.match(placeholder):
            raise ValueError(f"template placeholder '{placeholder}' must be lowerCamelCase")
    return template

