"""Compare only the observed WeChat PNG /0 -> /640 rendition rewrite.

Inputs are paths emitted by summarize_wechat_article_html, not arbitrary URL
strings. No image pixels, HTML, source hashes, or remote drafts are modified.
"""
import re

_PNG = re.compile(r"^(/(?:sz_)?mmbiz_png/[^/?#]+)/(0|640)$")


def same_ordered_images(expected, actual):
    if not isinstance(expected, list) or not isinstance(actual, list):
        return False
    if len(expected) != len(actual):
        return False
    for source, stored in zip(expected, actual):
        if not isinstance(source, str) or not isinstance(stored, str):
            return False
        if source == stored:
            continue
        left, right = _PNG.fullmatch(source), _PNG.fullmatch(stored)
        if not (left and right and left.group(1) == right.group(1)
                and left.group(2) == '0' and right.group(2) == '640'):
            return False
    return True


if __name__ == '__main__':
    a='/mmbiz_png/EXACTassetA/0'
    b='/sz_mmbiz_png/EXACTassetB/0'
    c=a[:-1]+'640'
    d=b[:-1]+'640'
    cases=[
        ([a,b],[a,b],True),
        ([a,b],[c,d],True),
        ([a,b],[a,d],True),
        ([a,b],[d,c],False),
        ([a,b],[c],False),
        ([a],[c.replace('assetA','otherAsset')],False),
        ([a],[c.replace('mmbiz_png','sz_mmbiz_png')],False),
        ([a],[a[:-1]+'1080'],False),
        (['https://unrelated.example'+a],['https://unrelated.example'+c],False),
        (['/other/EXACTassetA/0'],['/other/EXACTassetA/640'],False),
        ([c],[a],False),
        ([a],[c+'?different=1'],False),
        ([],[],True),
        ([None],[None],False),
        ('not-a-list',[],False),
    ]
    for index,(expected,actual,wanted) in enumerate(cases):
        assert same_ordered_images(expected,actual) is wanted,index
    print('PASS: 15 ordered-image identity cases; only observed WeChat PNG /0 -> /640 is normalized')
