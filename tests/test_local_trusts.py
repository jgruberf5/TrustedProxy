#!/usr/bin/env python2

import requests
import time
import sys
import signal
import argparse


def handler(signum, frame):
    print "\n\nExiting...\n\n"
    sys.exit(0)


def print_local_id():
    local_device_info = requests.get(
        'http://127.0.0.1:8100/mgmt/shared/identified-devices/config/device-info',
        auth=requests.auth.HTTPBasicAuth('admin', '')).json()
    local_certs = requests.get(
        'http://127.0.0.1:8100/mgmt/shared/device-certificates',
        auth=requests.auth.HTTPBasicAuth('admin', '')).json()['items']
    local_cert_id = ''
    for c in local_certs:
        if c['machineId'] == local_device_info['machineId']:
            local_cert_id = c['certificateId']
    print "########### LOCAL DEVICE ###########"
    print "%s version %s\n%s\nid: %s\ncertificate id:%s" % (
        local_device_info['platformMarketingName'],
        local_device_info['restFrameworkVersion'],
        local_device_info['hostname'],
        local_device_info['machineId'],
        local_cert_id)
    print "####################################"
    return local_cert_id


def print_local_proxy_trusts():
    proxy_trusts = requests.get(
        'http://127.0.0.1:8105/shared/TrustedProxy').json()
    print "######## LOCAL PROXY TRUSTS ########"
    for d in proxy_trusts:
        sec_left = int(600 - (int(time.time()) - d['timestamp'] / 1000))
        print 'have a trust token for: %s:%d for another %d seconds' % (d['targetHost'], d['targetPort'], sec_left)
    print "####################################"
    return proxy_trusts


def get_remote_device_info(targetHost, targetPort):
    data = {
        'method': 'Get',
        'uri': 'https://%s:%d/mgmt/shared/identified-devices/config/device-info' % (targetHost, targetPort)
    }
    return requests.post('http://127.0.0.1:8105/shared/TrustedProxy', json=data).json()


def get_remote_device_certificates(targetHost, targetPort):
    data = {
        'method': 'Get',
        'uri': 'https://%s:%d/mgmt/shared/device-certificates' % (targetHost, targetPort)
    }
    return requests.post('http://127.0.0.1:8105/shared/TrustedProxy', json=data).json()['items']


def do_you_trust_me():
    my_cert_id = print_local_id()
    devices = print_local_proxy_trusts()
    print "########## TESTING TRUSTS ##########"
    for d in devices:
        remote_device_info = get_remote_device_info(
            d['targetHost'], d['targetPort'])
        remote_certs = get_remote_device_certificates(
            d['targetHost'], d['targetPort'])
        trusted = False
        remote_certificate_id = ''
        for c in remote_certs:
            if c['certificateId'] == my_cert_id:
                trusted = True
            if c['machineId'] == remote_device_info['machineId']:
                remote_certificate_id = c['certificateId']
        remote_print = "%s at %s:%d (%s [%s] machineId: %s certificateId: %s)" % (
            remote_device_info['hostname'],
            d['targetHost'],
            d['targetPort'],
            remote_device_info['platformMarketingName'],
            remote_device_info['restFrameworkVersion'],
            remote_device_info['machineId'],
            remote_certificate_id
        )
        if trusted:
            print "%s trusts me" % remote_print
    print "####################################"


def test_cycle(delay):
    try:
        do_you_trust_me()
    except Exception as ex:
        print "test cycle failed with %s" % ex
    time.sleep(delay)


def main():
    ap = argparse.ArgumentParser(
        prog='test_local_trusts',
        usage='%(prog)s.py [options]',
        description='poll remote devices assuring trusts are established'
    )
    ap.add_argument(
        '--cycles',
        help="The number of cycles through local trusts to test",
        required=False,
        default=0
    )
    ap.add_argument(
        '--delay',
        help="The delay in seconds between cycles",
        required=False,
        default=10
    )
    args = ap.parse_args()
    signal.signal(signal.SIGINT, handler)
    if args.cycles == 0:
        while True:
            test_cycle(args.delay)
    else:
        for _ in range(args.cycles):
            test_cycle(args.delay)


if __name__ == '__main__':
    main()
